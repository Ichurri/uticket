import { prisma } from "@/lib/prisma";
import { utcToBoliviaLocal } from "@/lib/utils";

/**
 * The commercial layer of one event, shaped for the pricing screen. Kept out
 * of the route file so the server page can read it straight from Prisma (the
 * house rule: mutations go through the API, reads do not).
 */
export const pricingInclude = {
  zone: {
    select: {
      id: true,
      name: true,
      type: true,
      capacity: true,
      order: true,
      floor: { select: { name: true, order: true } },
      _count: { select: { seats: true } },
    },
  },
  eventTables: {
    orderBy: { table: { label: "asc" } },
    select: {
      id: true,
      price: true,
      seatPrice: true,
      inclusionType: true,
      inclusionValue: true,
      inclusionNote: true,
      status: true,
      seatsSold: true,
      table: { select: { id: true, label: true, seats: true, hasChairs: true } },
    },
  },
} as const;

export function loadPricingZones(eventId: string) {
  return prisma.eventZone.findMany({
    where: { eventId },
    include: pricingInclude,
    orderBy: [{ zone: { floor: { order: "asc" } } }, { zone: { order: "asc" } }],
  });
}

export type PricingZoneRow = Awaited<ReturnType<typeof loadPricingZones>>[number];

const decimal = (value: { toString(): string } | null) =>
  value === null ? null : Number(value);

export function toPricingDto(zone: PricingZoneRow) {
  return {
    eventZoneId: zone.id,
    zoneId: zone.zone.id,
    zoneName: zone.zone.name,
    floorName: zone.zone.floor.name,
    type: zone.zone.type,
    zoneCapacity: zone.zone.capacity,
    seatCount: zone.zone._count.seats,
    price: Number(zone.price),
    isEnabled: zone.isEnabled,
    capacityForSale: zone.capacityForSale,
    tableSaleMode: zone.tableSaleMode,
    seatPrice: decimal(zone.seatPrice),
    defaultInclusionType: zone.defaultInclusionType,
    defaultInclusionValue: decimal(zone.defaultInclusionValue),
    defaultInclusionNote: zone.defaultInclusionNote,
    salesStartAt: zone.salesStartAt ? utcToBoliviaLocal(zone.salesStartAt) : null,
    salesEndAt: zone.salesEndAt ? utcToBoliviaLocal(zone.salesEndAt) : null,
    tables: zone.eventTables.map((eventTable) => ({
      eventTableId: eventTable.id,
      tableId: eventTable.table.id,
      label: eventTable.table.label,
      seats: eventTable.table.seats,
      hasChairs: eventTable.table.hasChairs,
      status: eventTable.status,
      seatsSold: eventTable.seatsSold,
      price: decimal(eventTable.price),
      seatPrice: decimal(eventTable.seatPrice),
      inclusionType: eventTable.inclusionType,
      inclusionValue: decimal(eventTable.inclusionValue),
      inclusionNote: eventTable.inclusionNote,
    })),
  };
}

export type PricingZoneDto = ReturnType<typeof toPricingDto>;
export type PricingTableDto = PricingZoneDto["tables"][number];
