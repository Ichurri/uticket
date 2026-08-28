import { describe, expect, it } from "vitest";
import {
  floorBounds,
  floorHasLayout,
  seatIsTaken,
  smallestTarget,
  tableFreeSpots,
  tableIsTaken,
  zoneIsSoldOut,
} from "@/lib/seat-map-view";
import type { FloorDto, TableDto, ZoneDto } from "@/types/seat-map";

const table = (overrides: Partial<TableDto> = {}): TableDto => ({
  id: "et1",
  label: "M1",
  seats: 8,
  seatsSold: 0,
  hasChairs: true,
  shape: "ROUND",
  posX: 20,
  posY: 20,
  width: 60,
  height: 60,
  rotation: 0,
  price: 800,
  seatPrice: 120,
  inclusion: null,
  status: "AVAILABLE",
  ...overrides,
});

const zone = (overrides: Partial<ZoneDto> = {}): ZoneDto => ({
  id: "ez1",
  zoneId: "z1",
  name: "VIP",
  type: "TABLES",
  description: null,
  color: "#6D2BFF",
  posX: 0,
  posY: 0,
  width: 300,
  height: 200,
  rotation: 0,
  price: 800,
  tableSaleMode: "WHOLE_TABLE",
  available: 8,
  capacity: 8,
  tables: [table()],
  seats: [],
  ...overrides,
});

const floor = (zones: ZoneDto[]): FloorDto => ({
  id: "f1",
  name: "Planta baja",
  order: 0,
  canvasWidth: 1000,
  canvasHeight: 700,
  backgroundImage: null,
  zones,
});

describe("tableIsTaken", () => {
  it("frees a table only when it is AVAILABLE, if it sells whole", () => {
    expect(tableIsTaken(table(), "WHOLE_TABLE")).toBe(false);
    expect(tableIsTaken(table({ status: "HELD" }), "WHOLE_TABLE")).toBe(true);
    expect(tableIsTaken(table({ status: "SOLD" }), "WHOLE_TABLE")).toBe(true);
    expect(tableIsTaken(table({ status: "BLOCKED" }), "WHOLE_TABLE")).toBe(true);
  });

  it("still sells the spots a hold did not take, by the spot", () => {
    // Someone is holding 2 of 8: the other 6 are on the market
    const held = table({ status: "HELD", seatsSold: 2 });
    expect(tableIsTaken(held, "PER_SEAT")).toBe(false);
    expect(tableFreeSpots(held)).toBe(6);
  });

  it("is gone once every spot is taken", () => {
    expect(tableIsTaken(table({ seatsSold: 8 }), "PER_SEAT")).toBe(true);
  });

  it("stays gone when blocked, however it sells", () => {
    expect(tableIsTaken(table({ status: "BLOCKED" }), "PER_SEAT")).toBe(true);
  });
});

describe("seatIsTaken / zoneIsSoldOut", () => {
  it("reads the seat's own status", () => {
    const seat = { id: "s", row: "A", number: 1, posX: 0, posY: 0, price: 100 };
    expect(seatIsTaken({ ...seat, status: "AVAILABLE" })).toBe(false);
    expect(seatIsTaken({ ...seat, status: "HELD" })).toBe(true);
  });

  it("calls a zone sold out at zero", () => {
    expect(zoneIsSoldOut(zone({ available: 0 }))).toBe(true);
    expect(zoneIsSoldOut(zone({ available: 1 }))).toBe(false);
  });
});

describe("floorHasLayout", () => {
  it("trusts a single zone", () => {
    expect(floorHasLayout(floor([zone()]))).toBe(true);
  });

  it("refuses a floor whose zones were never moved apart", () => {
    expect(
      floorHasLayout(floor([zone({ id: "a" }), zone({ id: "b" })])),
    ).toBe(false);
  });

  it("accepts zones that sit in different places", () => {
    expect(
      floorHasLayout(
        floor([zone({ id: "a" }), zone({ id: "b", posX: 400, posY: 0 })]),
      ),
    ).toBe(true);
  });

  it("has nothing to draw with no zones", () => {
    expect(floorHasLayout(floor([]))).toBe(false);
  });
});

describe("floorBounds", () => {
  it("wraps every zone of the floor", () => {
    const bounds = floorBounds(
      floor([
        zone({ posX: 100, posY: 50, width: 200, height: 100 }),
        zone({ id: "b", posX: 400, posY: 200, width: 260, height: 180 }),
      ]),
    );
    expect(bounds).toEqual({ posX: 100, posY: 50, width: 560, height: 330 });
  });

  it("falls back to the whole canvas when there is nothing", () => {
    expect(floorBounds(floor([]))).toEqual({
      posX: 0,
      posY: 0,
      width: 1000,
      height: 700,
    });
  });
});

describe("smallestTarget", () => {
  it("takes the tightest table dimension", () => {
    expect(
      smallestTarget(
        zone({ tables: [table(), table({ id: "b", width: 140, height: 40 })] }),
      ),
    ).toBe(40);
  });

  it("uses the seat box for numbered zones", () => {
    expect(
      smallestTarget(
        zone({
          type: "SEATED",
          tables: [],
          seats: [
            { id: "s", row: "A", number: 1, posX: 0, posY: 0, price: 10, status: "AVAILABLE" },
          ],
        }),
      ),
    ).toBe(20);
  });

  it("is the whole box for a general zone", () => {
    expect(smallestTarget(zone({ type: "GENERAL", tables: [] }))).toBe(200);
  });
});
