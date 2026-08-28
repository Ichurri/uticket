import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, SaleStatus } from "@/generated/prisma/enums";

/** Orders that still hold inventory: waiting for payment, in review, or paid.
 * Everything else (CANCELLED) has released whatever it was holding. */
export const LIVE_ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "CONFIRMED",
];

/**
 * Availability lives in the COMMERCIAL layer, one row per event.
 *
 * The physical layer (Venue → Floor → Zone → Table/Seat) is geometry only and
 * is reused by every event held there. What is taken is recorded on
 * `EventTable` / `EventSeat`, which exist per event — so a table sold on
 * Friday stays free for Saturday's show in the same room.
 *
 * GENERAL zones have no per-spot row (there is nothing to point at), so their
 * occupancy is still counted from the order items of that event's live orders.
 */
export interface EventInventory {
  /** eventTableId → its sale status for this event */
  tableStatus: Map<string, SaleStatus>;
  /** eventTableId → spots taken, only meaningful in PER_SEAT mode */
  tableSeatsSold: Map<string, number>;
  /** physical seatId → its sale status; absent means AVAILABLE */
  seatStatus: Map<string, SaleStatus>;
  /** eventZoneId → tickets already committed in that GENERAL zone */
  generalTaken: Map<string, number>;
}

function emptyInventory(): EventInventory {
  return {
    tableStatus: new Map(),
    tableSeatsSold: new Map(),
    seatStatus: new Map(),
    generalTaken: new Map(),
  };
}

/** Reads run inside the order transaction too, so the client is injectable. */
type Client = Pick<
  Prisma.TransactionClient,
  "orderItem" | "eventTable" | "eventSeat" | "eventZone"
>;

export async function getInventoryByEvent(
  eventIds: string[],
  client: Client = prisma,
): Promise<Map<string, EventInventory>> {
  const byEvent = new Map(eventIds.map((id) => [id, emptyInventory()]));
  if (eventIds.length === 0) return byEvent;

  const [tables, seats, generalItems] = await Promise.all([
    client.eventTable.findMany({
      where: { eventZone: { eventId: { in: eventIds } } },
      select: {
        id: true,
        status: true,
        seatsSold: true,
        eventZone: { select: { eventId: true } },
      },
    }),
    client.eventSeat.findMany({
      where: { eventZone: { eventId: { in: eventIds } } },
      select: {
        seatId: true,
        status: true,
        eventZone: { select: { eventId: true } },
      },
    }),
    client.orderItem.findMany({
      where: {
        eventTableId: null,
        eventSeatId: null,
        eventZoneId: { not: null },
        order: { eventId: { in: eventIds }, status: { in: LIVE_ORDER_STATUSES } },
      },
      select: {
        eventZoneId: true,
        quantity: true,
        order: { select: { eventId: true } },
      },
    }),
  ]);

  for (const table of tables) {
    const inventory = byEvent.get(table.eventZone.eventId);
    if (!inventory) continue;
    inventory.tableStatus.set(table.id, table.status);
    inventory.tableSeatsSold.set(table.id, table.seatsSold);
  }

  for (const seat of seats) {
    const inventory = byEvent.get(seat.eventZone.eventId);
    if (!inventory) continue;
    inventory.seatStatus.set(seat.seatId, seat.status);
  }

  for (const item of generalItems) {
    const inventory = byEvent.get(item.order.eventId);
    if (!inventory || !item.eventZoneId) continue;
    inventory.generalTaken.set(
      item.eventZoneId,
      (inventory.generalTaken.get(item.eventZoneId) ?? 0) + item.quantity,
    );
  }

  return byEvent;
}

export async function getEventInventory(
  eventId: string,
  client: Client = prisma,
): Promise<EventInventory> {
  const byEvent = await getInventoryByEvent([eventId], client);
  return byEvent.get(eventId) ?? emptyInventory();
}

/** A spot is off the market unless it is explicitly AVAILABLE. */
export function isTaken(status: SaleStatus | undefined) {
  return status !== undefined && status !== "AVAILABLE";
}

/**
 * Expired checkout holds go back on sale. The stored status means someone has
 * to put it back — unlike the old derived model, where cancelling the order
 * was the release. Runs lazily before reads/writes and from the cron.
 */
export async function releaseExpiredHolds(client: Client = prisma) {
  const now = new Date();
  // Only the status is swept here. `seatsSold` is accounting that belongs to
  // specific orders, so it is adjusted in releaseOrderHolds, never blanked.
  const [tables, seats] = await Promise.all([
    client.eventTable.updateMany({
      where: { status: "HELD", heldUntil: { lt: now } },
      data: { status: "AVAILABLE", heldUntil: null },
    }),
    client.eventSeat.updateMany({
      where: { status: "HELD", heldUntil: { lt: now } },
      data: { status: "AVAILABLE", heldUntil: null },
    }),
  ]);
  return tables.count + seats.count;
}

/**
 * Put back everything the given orders were holding. Call this wherever an
 * order stops being live (expiry, buyer cancel, organizer reject, event
 * cancellation) — the commercial rows do not release themselves.
 */
export async function releaseOrderHolds(
  orderIds: string[],
  client: Pick<
    Prisma.TransactionClient,
    "orderItem" | "eventTable" | "eventSeat"
  > = prisma,
) {
  if (orderIds.length === 0) return;

  const items = await client.orderItem.findMany({
    where: { orderId: { in: orderIds } },
    select: { eventTableId: true, eventSeatId: true, seatsQuantity: true },
  });

  // Give back the spots each line took inside a PER_SEAT table
  const seatsBackByTable = new Map<string, number>();
  for (const item of items) {
    if (!item.eventTableId || !item.seatsQuantity) continue;
    seatsBackByTable.set(
      item.eventTableId,
      (seatsBackByTable.get(item.eventTableId) ?? 0) + item.seatsQuantity,
    );
  }
  for (const [tableId, seatsBack] of seatsBackByTable) {
    await client.eventTable.update({
      where: { id: tableId },
      data: { seatsSold: { decrement: seatsBack } },
    });
  }

  const wholeTableIds = items
    .filter((item) => item.eventTableId && !item.seatsQuantity)
    .map((item) => item.eventTableId as string);
  const seatIds = items
    .map((item) => item.eventSeatId)
    .filter((id): id is string => id !== null);

  if (wholeTableIds.length > 0) {
    await client.eventTable.updateMany({
      where: { id: { in: wholeTableIds } },
      data: { status: "AVAILABLE", heldUntil: null },
    });
  }
  // A PER_SEAT table only reopens once it has room again
  for (const tableId of seatsBackByTable.keys()) {
    const table = await client.eventTable.findUnique({
      where: { id: tableId },
      select: { seatsSold: true },
    });
    if (table && table.seatsSold <= 0) {
      await client.eventTable.update({
        where: { id: tableId },
        data: { status: "AVAILABLE", heldUntil: null, seatsSold: 0 },
      });
    }
  }
  if (seatIds.length > 0) {
    await client.eventSeat.updateMany({
      where: { id: { in: seatIds } },
      data: { status: "AVAILABLE", heldUntil: null },
    });
  }
}
