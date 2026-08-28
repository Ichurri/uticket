import type { Prisma } from "@/generated/prisma/client";

type Tx = Pick<Prisma.TransactionClient, "zone" | "eventZone" | "eventTable">;

/**
 * Put every active zone of the event's venue on sale.
 *
 * Called when an event is created or moved to another venue. EventTable rows
 * are created eagerly (tables come in dozens); EventSeat rows are NOT — a
 * theatre has thousands of seats and "no row" already means available at the
 * zone price.
 *
 * Existing EventZones are left untouched, so re-running it after the
 * organizer has priced things never clobbers their work.
 */
export async function syncEventZones(
  tx: Tx,
  {
    eventId,
    venueId,
    basePrice,
  }: { eventId: string; venueId: string; basePrice: number },
) {
  const zones = await tx.zone.findMany({
    where: { isActive: true, floor: { venueId, isActive: true } },
    select: {
      id: true,
      type: true,
      capacity: true,
      order: true,
      tables: { select: { id: true } },
    },
    orderBy: [{ floor: { order: "asc" } }, { order: "asc" }],
  });

  const existing = await tx.eventZone.findMany({
    where: { eventId },
    select: { zoneId: true },
  });
  const alreadyThere = new Set(existing.map((row) => row.zoneId));

  let created = 0;
  for (const zone of zones) {
    if (alreadyThere.has(zone.id)) continue;

    const eventZone = await tx.eventZone.create({
      data: {
        eventId,
        zoneId: zone.id,
        price: basePrice,
        capacityForSale: zone.type === "GENERAL" ? zone.capacity : null,
      },
      select: { id: true },
    });
    created++;

    if (zone.type === "TABLES" && zone.tables.length > 0) {
      await tx.eventTable.createMany({
        data: zone.tables.map((table) => ({
          eventZoneId: eventZone.id,
          tableId: table.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  return created;
}

/**
 * Put the tables of these zones on sale for every event that already uses
 * them. The layout editor calls it after a save: a table drawn today has to
 * show up in the events that were already pointing at its zone, or it stays
 * invisible until someone re-saves the event.
 */
export async function syncZoneTables(
  tx: Pick<Prisma.TransactionClient, "eventZone" | "eventTable">,
  zoneIds: string[],
) {
  if (zoneIds.length === 0) return 0;

  const eventZones = await tx.eventZone.findMany({
    where: { zoneId: { in: zoneIds }, zone: { type: "TABLES" } },
    select: { id: true, zone: { select: { tables: { select: { id: true } } } } },
  });

  const rows = eventZones.flatMap((eventZone) =>
    eventZone.zone.tables.map((table) => ({
      eventZoneId: eventZone.id,
      tableId: table.id,
    })),
  );
  if (rows.length === 0) return 0;

  const { count } = await tx.eventTable.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return count;
}

/** Resolved price for one table: its own override, else the zone price. */
export function tablePrice(
  eventTable: { price: Prisma.Decimal | null },
  eventZone: { price: Prisma.Decimal },
) {
  return Number(eventTable.price ?? eventZone.price);
}

/** Resolved per-spot price when the zone sells PER_SEAT. */
export function tableSeatPrice(
  eventTable: { seatPrice: Prisma.Decimal | null },
  eventZone: { seatPrice: Prisma.Decimal | null; price: Prisma.Decimal },
) {
  return Number(eventTable.seatPrice ?? eventZone.seatPrice ?? eventZone.price);
}

/** Resolved price for one numbered seat. */
export function seatPrice(
  eventSeat: { price: Prisma.Decimal | null } | null,
  eventZone: { price: Prisma.Decimal },
) {
  return Number(eventSeat?.price ?? eventZone.price);
}

/** Inclusion, with the table's override winning over the zone default. */
export function resolveInclusion(
  eventTable: {
    inclusionType: string | null;
    inclusionValue: Prisma.Decimal | null;
    inclusionNote: string | null;
  } | null,
  eventZone: {
    defaultInclusionType: string;
    defaultInclusionValue: Prisma.Decimal | null;
    defaultInclusionNote: string | null;
  },
) {
  if (eventTable?.inclusionType) {
    return {
      inclusionType: eventTable.inclusionType,
      inclusionValue:
        eventTable.inclusionValue !== null
          ? Number(eventTable.inclusionValue)
          : null,
      inclusionNote: eventTable.inclusionNote,
    };
  }
  return {
    inclusionType: eventZone.defaultInclusionType,
    inclusionValue:
      eventZone.defaultInclusionValue !== null
        ? Number(eventZone.defaultInclusionValue)
        : null,
    inclusionNote: eventZone.defaultInclusionNote,
  };
}

/** Select fragment for reading an EventZone's capacity in one query. */
export const eventZoneCapacitySelect = {
  id: true,
  capacityForSale: true,
  zone: {
    select: {
      name: true,
      type: true,
      capacity: true,
      tables: { select: { seats: true } },
      _count: { select: { seats: true } },
    },
  },
} as const;

/** People this zone can take for this event: the stock held back for sale
 * (GENERAL), the seats of its tables (TABLES), or its seat rows (SEATED). */
export function eventZoneCapacity(eventZone: {
  capacityForSale: number | null;
  zone: {
    type: "GENERAL" | "TABLES" | "SEATED";
    capacity: number | null;
    tables: { seats: number }[];
    _count: { seats: number };
  };
}): number {
  if (eventZone.zone.type === "TABLES") {
    return eventZone.zone.tables.reduce((sum, table) => sum + table.seats, 0);
  }
  if (eventZone.zone.type === "SEATED") return eventZone.zone._count.seats;
  return eventZone.capacityForSale ?? eventZone.zone.capacity ?? 0;
}
