import type { z } from "zod";
import type { venueSchema } from "@/lib/validations/venue";
import type { SeatMapType } from "@/generated/prisma/enums";

export type ParsedZone = z.output<typeof venueSchema>["zones"][number];

export function zoneCapacity(zone: ParsedZone): number {
  return zone.numbered ? zone.rows! * zone.seatsPerRow! : zone.capacity!;
}

export function venueCapacity(zones: ParsedZone[]): number {
  return zones.reduce((sum, zone) => sum + zoneCapacity(zone), 0);
}

export function seatMapTypeFor(zones: ParsedZone[]): SeatMapType {
  const numberedCount = zones.filter((zone) => zone.numbered).length;
  if (numberedCount === 0) return "ZONE";
  if (numberedCount === zones.length) return "NUMBERED";
  return "BOTH";
}

/** Rows are labeled A, B, C... and seats numbered 1..N within each row. */
export function seatsFor(zone: ParsedZone): { row: string; number: number }[] {
  if (!zone.numbered) return [];

  const seats: { row: string; number: number }[] = [];
  for (let rowIndex = 0; rowIndex < zone.rows!; rowIndex++) {
    const row = String.fromCharCode(65 + rowIndex);
    for (let number = 1; number <= zone.seatsPerRow!; number++) {
      seats.push({ row, number });
    }
  }
  return seats;
}

export function zoneCreateData(zones: ParsedZone[]) {
  return zones.map((zone) => ({
    name: zone.name,
    capacity: zoneCapacity(zone),
    priceMultiplier: zone.priceMultiplier,
    rows: zone.numbered ? zone.rows : null,
    seatsPerRow: zone.numbered ? zone.seatsPerRow : null,
    seats: { createMany: { data: seatsFor(zone) } },
  }));
}
