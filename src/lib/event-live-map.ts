import { prisma } from "@/lib/prisma";
import { orderItemTotal, ticketCountFor } from "@/lib/order-items";
import { orderReference } from "@/lib/utils";
import type { OrderStatus, TableShape, ZoneType } from "@/generated/prisma/enums";

/**
 * The organizer's live view of one event: the same plan the buyer sees, but
 * coloured by what is actually happening on it.
 *
 * `EventTable.status` alone is not enough to tell the story — HELD covers both
 * "someone is about to pay" and "the proof is on your desk". So the state here
 * is resolved from the ORDER behind each piece, and the order itself travels
 * with it so tapping a table can say who has it.
 */
export type LiveState = "AVAILABLE" | "PENDING" | "CONFIRMED" | "BLOCKED";

export interface LiveHolder {
  orderId: string;
  reference: string;
  buyerName: string;
  buyerEmail: string;
  orderStatus: OrderStatus;
  /** People this line covers */
  people: number;
  amount: number;
  createdAt: string;
}

export interface LiveTable {
  eventTableId: string;
  label: string;
  seats: number;
  seatsSold: number;
  hasChairs: boolean;
  shape: TableShape;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  price: number;
  state: LiveState;
  holders: LiveHolder[];
}

export interface LiveSeat {
  seatId: string;
  row: string;
  number: number;
  posX: number;
  posY: number;
  state: LiveState;
  holder: LiveHolder | null;
}

export interface LiveZone {
  eventZoneId: string;
  name: string;
  type: ZoneType;
  color: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  price: number;
  isEnabled: boolean;
  capacity: number;
  /** People confirmed, and people in a live order that is not paid yet */
  confirmed: number;
  pending: number;
  available: number;
  revenueConfirmed: number;
  revenuePending: number;
  tables: LiveTable[];
  seats: LiveSeat[];
  /** Buyers of a GENERAL zone, which has no piece to attach them to */
  holders: LiveHolder[];
}

export interface LiveFloor {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  zones: LiveZone[];
}

export interface EventLiveMap {
  floors: LiveFloor[];
  totals: {
    capacity: number;
    confirmed: number;
    pending: number;
    available: number;
    revenueConfirmed: number;
    revenuePending: number;
  };
}

const LIVE_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "CONFIRMED",
];

export async function getEventLiveMap(eventId: string): Promise<EventLiveMap> {
  const [eventZones, items] = await Promise.all([
    prisma.eventZone.findMany({
      where: { eventId },
      include: {
        zone: {
          include: {
            floor: true,
            seats: { orderBy: [{ row: "asc" }, { number: "asc" }] },
          },
        },
        eventTables: {
          include: { table: true },
          orderBy: { table: { label: "asc" } },
        },
        eventSeats: { select: { id: true, seatId: true, status: true } },
      },
      orderBy: [{ zone: { floor: { order: "asc" } } }, { zone: { order: "asc" } }],
    }),
    prisma.orderItem.findMany({
      where: { order: { eventId, status: { in: LIVE_STATUSES } } },
      include: {
        eventTable: { include: { table: { select: { seats: true } } } },
        order: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            buyer: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { order: { createdAt: "asc" } },
    }),
  ]);

  const byTable = new Map<string, LiveHolder[]>();
  const bySeat = new Map<string, LiveHolder>();
  const byZone = new Map<string, LiveHolder[]>();

  for (const item of items) {
    const holder: LiveHolder = {
      orderId: item.order.id,
      reference: orderReference(item.order.id),
      buyerName: item.order.buyer.name ?? "Sin nombre",
      buyerEmail: item.order.buyer.email ?? "",
      orderStatus: item.order.status,
      people: ticketCountFor({
        quantity: item.quantity,
        seatsQuantity: item.seatsQuantity,
        eventSeatId: item.eventSeatId,
        eventTable: item.eventTable,
      }),
      amount: orderItemTotal({
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        seatsQuantity: item.seatsQuantity,
      }),
      createdAt: item.order.createdAt.toISOString(),
    };

    if (item.eventTableId) {
      byTable.set(item.eventTableId, [
        ...(byTable.get(item.eventTableId) ?? []),
        holder,
      ]);
    } else if (item.eventSeatId) {
      bySeat.set(item.eventSeatId, holder);
    } else if (item.eventZoneId) {
      byZone.set(item.eventZoneId, [
        ...(byZone.get(item.eventZoneId) ?? []),
        holder,
      ]);
    }
  }

  /** CONFIRMED beats a pending hold: the money is in. */
  function stateFor(holders: LiveHolder[]): LiveState {
    if (holders.length === 0) return "AVAILABLE";
    return holders.some((holder) => holder.orderStatus === "CONFIRMED")
      ? "CONFIRMED"
      : "PENDING";
  }

  const floors = new Map<string, LiveFloor>();
  const totals = {
    capacity: 0,
    confirmed: 0,
    pending: 0,
    available: 0,
    revenueConfirmed: 0,
    revenuePending: 0,
  };

  for (const eventZone of eventZones) {
    const zone = eventZone.zone;
    if (!floors.has(zone.floor.id)) {
      floors.set(zone.floor.id, {
        id: zone.floor.id,
        name: zone.floor.name,
        canvasWidth: zone.floor.canvasWidth,
        canvasHeight: zone.floor.canvasHeight,
        zones: [],
      });
    }

    const tables: LiveTable[] = eventZone.eventTables.map((eventTable) => {
      const holders = byTable.get(eventTable.id) ?? [];
      return {
        eventTableId: eventTable.id,
        label: eventTable.table.label,
        seats: eventTable.table.seats,
        seatsSold: eventTable.seatsSold,
        hasChairs: eventTable.table.hasChairs,
        shape: eventTable.table.shape,
        posX: eventTable.table.posX,
        posY: eventTable.table.posY,
        width: eventTable.table.width,
        height: eventTable.table.height,
        rotation: eventTable.table.rotation,
        price: Number(eventTable.price ?? eventZone.price),
        state:
          eventTable.status === "BLOCKED" ? "BLOCKED" : stateFor(holders),
        holders,
      };
    });

    const seatRowById = new Map(
      eventZone.eventSeats.map((eventSeat) => [eventSeat.seatId, eventSeat]),
    );
    const seats: LiveSeat[] = zone.seats.map((seat) => {
      const row = seatRowById.get(seat.id);
      const holder = row ? (bySeat.get(row.id) ?? null) : null;
      return {
        seatId: seat.id,
        row: seat.row,
        number: seat.number,
        posX: seat.posX,
        posY: seat.posY,
        state:
          row?.status === "BLOCKED"
            ? "BLOCKED"
            : stateFor(holder ? [holder] : []),
        holder,
      };
    });

    const zoneHolders = byZone.get(eventZone.id) ?? [];
    const everyHolder = [
      ...zoneHolders,
      ...tables.flatMap((table) => table.holders),
      ...seats.flatMap((seat) => (seat.holder ? [seat.holder] : [])),
    ];

    const confirmed = everyHolder
      .filter((holder) => holder.orderStatus === "CONFIRMED")
      .reduce((sum, holder) => sum + holder.people, 0);
    const pending = everyHolder
      .filter((holder) => holder.orderStatus !== "CONFIRMED")
      .reduce((sum, holder) => sum + holder.people, 0);
    const revenueConfirmed = everyHolder
      .filter((holder) => holder.orderStatus === "CONFIRMED")
      .reduce((sum, holder) => sum + holder.amount, 0);
    const revenuePending = everyHolder
      .filter((holder) => holder.orderStatus !== "CONFIRMED")
      .reduce((sum, holder) => sum + holder.amount, 0);

    // Capacity is what can still be SOLD, so a blocked piece is not stock:
    // counting it would report a table nobody can buy as a free one.
    let capacity: number;
    if (zone.type === "TABLES") {
      capacity = tables
        .filter((table) => table.state !== "BLOCKED")
        .reduce((sum, table) => sum + table.seats, 0);
    } else if (zone.type === "SEATED") {
      capacity = seats.filter((seat) => seat.state !== "BLOCKED").length;
    } else {
      capacity = eventZone.capacityForSale ?? zone.capacity ?? 0;
    }

    const liveZone: LiveZone = {
      eventZoneId: eventZone.id,
      name: zone.name,
      type: zone.type,
      color: zone.color,
      posX: zone.posX,
      posY: zone.posY,
      width: zone.width,
      height: zone.height,
      rotation: zone.rotation,
      price: Number(eventZone.price),
      isEnabled: eventZone.isEnabled,
      capacity,
      confirmed,
      pending,
      available: Math.max(0, capacity - confirmed - pending),
      revenueConfirmed,
      revenuePending,
      tables,
      seats,
      holders: zoneHolders,
    };

    floors.get(zone.floor.id)!.zones.push(liveZone);

    // A zone that is off sale still shows on the plan, but it is not stock
    if (eventZone.isEnabled) totals.capacity += capacity;
    totals.confirmed += confirmed;
    totals.pending += pending;
    totals.revenueConfirmed += revenueConfirmed;
    totals.revenuePending += revenuePending;
  }

  totals.available = Math.max(
    0,
    totals.capacity - totals.confirmed - totals.pending,
  );

  return { floors: [...floors.values()], totals };
}
