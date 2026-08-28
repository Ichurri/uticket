import { describe, expect, it } from "vitest";
import {
  zoneCapacity,
  floorCapacity,
  venueCapacity,
  sumVenueCapacity,
  seatGrid,
  tableGrid,
  zoneCreateData,
  type ParsedZone,
  type ParsedFloor,
} from "@/lib/venue-zones";

const geometry = {
  color: "#6366f1",
  order: 0,
  posX: 0,
  posY: 0,
  width: 200,
  height: 150,
  rotation: 0,
};

const generalZone: ParsedZone = {
  ...geometry,
  name: "General",
  type: "GENERAL",
  capacity: 100,
};

const seatedZone: ParsedZone = {
  ...geometry,
  name: "Platea",
  type: "SEATED",
  seats: seatGrid(3, 4),
};

const tableZone: ParsedZone = {
  ...geometry,
  name: "Mesas",
  type: "TABLES",
  tables: tableGrid(4, 6).map((table) => ({
    ...table,
    hasChairs: true,
    shape: "ROUND" as const,
    width: 60,
    height: 60,
    rotation: 0,
  })),
};

const floor: ParsedFloor = {
  name: "Planta baja",
  order: 0,
  canvasWidth: 1000,
  canvasHeight: 700,
  zones: [generalZone, seatedZone, tableZone],
};

describe("zoneCapacity", () => {
  it("uses the declared headcount for GENERAL zones", () => {
    expect(zoneCapacity(generalZone)).toBe(100);
  });

  it("counts the seat rows for SEATED zones", () => {
    expect(zoneCapacity(seatedZone)).toBe(12);
  });

  it("sums what its tables seat for TABLES zones", () => {
    expect(zoneCapacity(tableZone)).toBe(24);
  });
});

describe("floorCapacity / venueCapacity", () => {
  it("adds up every zone of the floor", () => {
    expect(floorCapacity(floor)).toBe(136);
  });

  it("adds up every floor of the venue", () => {
    expect(venueCapacity([floor, { ...floor, name: "Planta alta" }])).toBe(272);
  });
});

describe("seatGrid", () => {
  it("labels rows A, B, C… and positions each seat", () => {
    const seats = seatGrid(3, 4);
    expect(seats).toHaveLength(12);
    expect(seats[0]).toEqual({ row: "A", number: 1, posX: 10, posY: 10 });
    expect(seats.at(-1)).toEqual({
      row: "C",
      number: 4,
      posX: 10 + 3 * 28,
      posY: 10 + 2 * 28,
    });
    expect([...new Set(seats.map((seat) => seat.row))]).toEqual(["A", "B", "C"]);
  });
});

describe("tableGrid", () => {
  it("labels tables M1…Mn and lays them out in rows of three", () => {
    const tables = tableGrid(4, 6);
    expect(tables).toHaveLength(4);
    expect(tables[0]).toEqual({ label: "M1", seats: 6, posX: 20, posY: 20 });
    // The fourth wraps to the second row
    expect(tables[3]).toEqual({ label: "M4", seats: 6, posX: 20, posY: 100 });
  });
});

describe("zoneCreateData", () => {
  it("keeps capacity only for GENERAL zones", () => {
    expect(zoneCreateData(generalZone).capacity).toBe(100);
    expect(zoneCreateData(seatedZone).capacity).toBeNull();
    expect(zoneCreateData(tableZone).capacity).toBeNull();
  });

  it("creates tables only for TABLES and seats only for SEATED", () => {
    const seated = zoneCreateData(seatedZone);
    const tables = zoneCreateData(tableZone);
    expect(seated.seats?.createMany.data).toHaveLength(12);
    expect(seated.tables).toBeUndefined();
    expect(tables.tables?.createMany.data).toHaveLength(4);
    expect(tables.seats).toBeUndefined();
  });

  it("carries the geometry through", () => {
    const data = zoneCreateData(tableZone);
    expect(data.posX).toBe(0);
    expect(data.width).toBe(200);
    expect(data.type).toBe("TABLES");
  });
});

describe("sumVenueCapacity", () => {
  it("derives capacity from stored rows, never from a stored number", () => {
    expect(
      sumVenueCapacity({
        floors: [
          {
            zones: [
              {
                type: "GENERAL",
                capacity: 120,
                tables: [],
                _count: { seats: 0 },
              },
              {
                type: "TABLES",
                capacity: null,
                tables: [{ seats: 8 }, { seats: 6 }],
                _count: { seats: 0 },
              },
              {
                type: "SEATED",
                capacity: null,
                tables: [],
                _count: { seats: 40 },
              },
            ],
          },
        ],
      }),
    ).toBe(174);
  });
});
