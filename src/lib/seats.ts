import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import type { SeatStatusDto } from "@/types/seat-map";

/** Orders that still hold inventory: waiting for payment, in review, or paid.
 * Everything else (CANCELLED) has released whatever it was holding. */
export const LIVE_ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "CONFIRMED",
];

/**
 * Availability is always per EVENT, never per venue.
 *
 * A venue's seats are shared by every event held there (a theatre runs the
 * same seat map on Friday and on Saturday), so a seat cannot carry a global
 * status: it is occupied *for one event* when a live order of that event
 * holds it. Free-capacity zones already worked this way; numbered seats now
 * follow the same rule, from the same query.
 */
export interface EventInventory {
  /** seatId → how this event's orders hold it (paid = SOLD, otherwise RESERVED) */
  seatHolds: Map<string, Exclude<SeatStatusDto, "AVAILABLE">>;
  /** zoneId → tickets already committed in that free-capacity zone */
  freeZoneTaken: Map<string, number>;
}

function emptyInventory(): EventInventory {
  return { seatHolds: new Map(), freeZoneTaken: new Map() };
}

/** Reads run inside the order transaction too, so the client is injectable. */
type Client = Pick<Prisma.TransactionClient, "orderItem">;

/** Inventory held by live orders, keyed by event. Events with nothing sold
 * still get an entry, so callers never have to null-check. */
export async function getInventoryByEvent(
  eventIds: string[],
  client: Client = prisma,
): Promise<Map<string, EventInventory>> {
  const byEvent = new Map(eventIds.map((id) => [id, emptyInventory()]));
  if (eventIds.length === 0) return byEvent;

  const items = await client.orderItem.findMany({
    where: {
      order: { eventId: { in: eventIds }, status: { in: LIVE_ORDER_STATUSES } },
    },
    select: {
      seatId: true,
      zoneId: true,
      quantity: true,
      order: { select: { eventId: true, status: true } },
    },
  });

  for (const item of items) {
    const inventory = byEvent.get(item.order.eventId);
    if (!inventory) continue;
    if (item.seatId) {
      // A paid seat reads as SOLD; one still being paid for reads as RESERVED.
      inventory.seatHolds.set(
        item.seatId,
        item.order.status === "CONFIRMED" ? "SOLD" : "RESERVED",
      );
    } else if (item.zoneId) {
      inventory.freeZoneTaken.set(
        item.zoneId,
        (inventory.freeZoneTaken.get(item.zoneId) ?? 0) + item.quantity,
      );
    }
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

/**
 * Seats of this event that a live order already holds, out of the given set.
 * Used to reject a purchase before creating the order; the surrounding
 * Serializable transaction is what makes it safe against a concurrent buyer
 * grabbing the same seat (the loser aborts with P2034 → 409).
 */
export async function findTakenSeatIds(
  eventId: string,
  seatIds: string[],
  client: Client = prisma,
): Promise<string[]> {
  if (seatIds.length === 0) return [];
  const held = await client.orderItem.findMany({
    where: {
      seatId: { in: seatIds },
      order: { eventId, status: { in: LIVE_ORDER_STATUSES } },
    },
    select: { seatId: true },
  });
  return held
    .map((item) => item.seatId)
    .filter((seatId): seatId is string => seatId !== null);
}
