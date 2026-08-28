import type { z } from "zod";
import type { venueSchema, zoneSchema } from "@/lib/validations/venue";
import type { ZoneType } from "@/generated/prisma/enums";

export type ParsedVenue = z.output<typeof venueSchema>;
export type ParsedFloor = ParsedVenue["floors"][number];
export type ParsedZone = z.output<typeof zoneSchema>;

/**
 * Capacity is DERIVED from the layout, never typed in: headcount for GENERAL,
 * the sum of table seats for TABLES, the seat count for SEATED.
 */
export function zoneCapacity(zone: ParsedZone): number {
  switch (zone.type) {
    case "GENERAL":
      return zone.capacity ?? 0;
    case "TABLES":
      return (zone.tables ?? []).reduce((sum, table) => sum + table.seats, 0);
    case "SEATED":
      return (zone.seats ?? []).length;
  }
}

export function floorCapacity(floor: ParsedFloor): number {
  return floor.zones.reduce((sum, zone) => sum + zoneCapacity(zone), 0);
}

export function venueCapacity(floors: ParsedFloor[]): number {
  return floors.reduce((sum, floor) => sum + floorCapacity(floor), 0);
}

/** Rows are labeled A, B, C... and seats numbered 1..N within each row. */
export function seatGrid(
  rows: number,
  seatsPerRow: number,
  pitch = 28,
): { row: string; number: number; posX: number; posY: number }[] {
  const seats: { row: string; number: number; posX: number; posY: number }[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    const row = String.fromCharCode(65 + rowIndex);
    for (let number = 1; number <= seatsPerRow; number++) {
      seats.push({
        row,
        number,
        posX: 10 + (number - 1) * pitch,
        posY: 10 + rowIndex * pitch,
      });
    }
  }
  return seats;
}

/** Lay N tables out in a grid inside their zone. */
export function tableGrid(
  count: number,
  seatsPerTable: number,
  {
    size = 60,
    gap = 20,
    perRow = 3,
    labelPrefix = "M",
  }: { size?: number; gap?: number; perRow?: number; labelPrefix?: string } = {},
) {
  return Array.from({ length: count }, (_, index) => ({
    label: `${labelPrefix}${index + 1}`,
    seats: seatsPerTable,
    posX: gap + (index % perRow) * (size + gap),
    posY: gap + Math.floor(index / perRow) * (size + gap),
  }));
}

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  GENERAL: "General (por aforo)",
  TABLES: "Mesas",
  SEATED: "Asientos numerados",
};

export function zoneCreateData(zone: ParsedZone) {
  return {
    name: zone.name,
    type: zone.type,
    description: zone.description ?? null,
    color: zone.color,
    order: zone.order ?? 0,
    capacity: zone.type === "GENERAL" ? (zone.capacity ?? 0) : null,
    posX: zone.posX,
    posY: zone.posY,
    width: zone.width,
    height: zone.height,
    rotation: zone.rotation,
    tables:
      zone.type === "TABLES"
        ? { createMany: { data: zone.tables ?? [] } }
        : undefined,
    seats:
      zone.type === "SEATED"
        ? { createMany: { data: zone.seats ?? [] } }
        : undefined,
  };
}

/** Select fragment for reading a venue's derived capacity in one query. */
export const venueCapacitySelect = {
  floors: {
    select: {
      zones: {
        select: {
          type: true,
          capacity: true,
          tables: { select: { seats: true } },
          _count: { select: { seats: true } },
        },
      },
    },
  },
} as const;

interface CapacityShape {
  floors: {
    zones: {
      type: "GENERAL" | "TABLES" | "SEATED";
      capacity: number | null;
      tables: { seats: number }[];
      _count: { seats: number };
    }[];
  }[];
}

/** Capacity is never stored: headcount for GENERAL, table seats for TABLES,
 * seat rows for SEATED, summed across every floor. */
export function sumVenueCapacity(venue: CapacityShape): number {
  return venue.floors.reduce(
    (total, floor) =>
      total +
      floor.zones.reduce((sum, zone) => {
        if (zone.type === "TABLES") {
          return sum + zone.tables.reduce((s, table) => s + table.seats, 0);
        }
        if (zone.type === "SEATED") return sum + zone._count.seats;
        return sum + (zone.capacity ?? 0);
      }, 0),
    0,
  );
}
