import { describe, expect, it } from "vitest";
import {
  zoneCapacity,
  venueCapacity,
  seatMapTypeFor,
  seatsFor,
  zoneCreateData,
  type ParsedZone,
} from "@/lib/venue-zones";

const numberedZone: ParsedZone = {
  name: "VIP",
  priceMultiplier: 1.5,
  numbered: true,
  rows: 3,
  seatsPerRow: 4,
};

const freeZone: ParsedZone = {
  name: "General",
  priceMultiplier: 1,
  numbered: false,
  capacity: 100,
};

describe("zoneCapacity", () => {
  it("multiplies rows by seats per row for numbered zones", () => {
    expect(zoneCapacity(numberedZone)).toBe(12);
  });

  it("uses the declared capacity for free zones", () => {
    expect(zoneCapacity(freeZone)).toBe(100);
  });
});

describe("venueCapacity", () => {
  it("sums all zone capacities", () => {
    expect(venueCapacity([numberedZone, freeZone])).toBe(112);
  });
});

describe("seatMapTypeFor", () => {
  it("is ZONE when no zone is numbered", () => {
    expect(seatMapTypeFor([freeZone])).toBe("ZONE");
  });

  it("is NUMBERED when every zone is numbered", () => {
    expect(seatMapTypeFor([numberedZone])).toBe("NUMBERED");
  });

  it("is BOTH when mixed", () => {
    expect(seatMapTypeFor([numberedZone, freeZone])).toBe("BOTH");
  });
});

describe("seatsFor", () => {
  it("generates a labeled grid with rows A, B, C...", () => {
    const seats = seatsFor(numberedZone);
    expect(seats).toHaveLength(12);
    expect(seats[0]).toEqual({ row: "A", number: 1 });
    expect(seats.at(-1)).toEqual({ row: "C", number: 4 });
    const rows = new Set(seats.map((seat) => seat.row));
    expect([...rows]).toEqual(["A", "B", "C"]);
  });

  it("returns no seats for free zones", () => {
    expect(seatsFor(freeZone)).toEqual([]);
  });
});

describe("zoneCreateData", () => {
  it("stores grid dimensions only for numbered zones", () => {
    const [numbered, free] = zoneCreateData([numberedZone, freeZone]);
    expect(numbered.rows).toBe(3);
    expect(numbered.seatsPerRow).toBe(4);
    expect(numbered.capacity).toBe(12);
    expect(numbered.seats.createMany.data).toHaveLength(12);
    expect(free.rows).toBeNull();
    expect(free.seatsPerRow).toBeNull();
    expect(free.seats.createMany.data).toHaveLength(0);
  });
});
