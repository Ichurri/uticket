import { describe, expect, it } from "vitest";
import {
  CHAIR_GAP,
  chairPositions,
  clamp,
  dragTableTo,
  dragZoneTo,
  generateTables,
  nextTableLabel,
  requiredZoneSize,
  resizeZoneTo,
  rotateVector,
  snap,
  splitSides,
  tableFootprint,
} from "@/lib/venue-layout";

describe("snap / clamp", () => {
  it("snaps to the nearest grid step", () => {
    expect(snap(13)).toBe(10);
    expect(snap(16)).toBe(20);
    expect(snap(-4)).toBe(-0);
    expect(snap(38, 25)).toBe(50);
  });

  it("clamps into range", () => {
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(500, 0, 100)).toBe(100);
    expect(clamp(50, 0, 100)).toBe(50);
  });
});

describe("rotateVector", () => {
  it("returns the vector untouched at 0°", () => {
    expect(rotateVector(10, 5, 0)).toEqual({ dx: 10, dy: 5 });
  });

  it("turns a drag a quarter turn", () => {
    const { dx, dy } = rotateVector(10, 0, 90);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeCloseTo(10);
  });
});

describe("splitSides", () => {
  it("shares a square out evenly", () => {
    expect(splitSides(8, 60, 60)).toEqual([2, 2, 2, 2]);
  });

  it("puts most chairs on the long sides of a rectangle", () => {
    const [top, right, bottom, left] = splitSides(8, 120, 60);
    expect(top).toBe(3);
    expect(bottom).toBe(3);
    expect(right).toBe(1);
    expect(left).toBe(1);
  });

  it("never loses or invents a chair", () => {
    for (let count = 1; count <= 20; count++) {
      const sides = splitSides(count, 110, 60);
      expect(sides.reduce((a, b) => a + b, 0)).toBe(count);
    }
  });

  it("returns nothing for an empty table", () => {
    expect(splitSides(0, 60, 60)).toEqual([0, 0, 0, 0]);
  });
});

describe("chairPositions", () => {
  it("rings a round table evenly, starting at the top", () => {
    const chairs = chairPositions({
      shape: "ROUND",
      seats: 4,
      width: 60,
      height: 60,
    });
    expect(chairs).toHaveLength(4);
    const radius = 30 + CHAIR_GAP;
    expect(chairs[0].x).toBeCloseTo(0);
    expect(chairs[0].y).toBeCloseTo(-radius);
    expect(chairs[1].x).toBeCloseTo(radius);
    expect(chairs[1].y).toBeCloseTo(0);
    for (const chair of chairs) {
      expect(Math.hypot(chair.x, chair.y)).toBeCloseTo(radius);
    }
  });

  it("lines a rectangle's chairs up outside its edges", () => {
    const chairs = chairPositions({
      shape: "RECT",
      seats: 8,
      width: 120,
      height: 60,
    });
    expect(chairs).toHaveLength(8);
    const top = chairs.filter((chair) => chair.angle === 0);
    expect(top).toHaveLength(3);
    for (const chair of top) {
      expect(chair.y).toBeCloseTo(-30 - CHAIR_GAP);
      expect(Math.abs(chair.x)).toBeLessThan(60);
    }
  });

  it("draws nothing for a table with no capacity", () => {
    expect(
      chairPositions({ shape: "ROUND", seats: 0, width: 60, height: 60 }),
    ).toEqual([]);
  });
});

describe("tableFootprint", () => {
  it("only reserves room for chairs when the table has them", () => {
    const bare = tableFootprint({
      shape: "ROUND",
      width: 60,
      height: 60,
      hasChairs: false,
    });
    const chaired = tableFootprint({
      shape: "ROUND",
      width: 60,
      height: 60,
      hasChairs: true,
    });
    expect(bare).toEqual({ width: 60, height: 60 });
    expect(chaired.width).toBeGreaterThan(60);
  });
});

describe("nextTableLabel", () => {
  it("takes the first free number", () => {
    expect(nextTableLabel([])).toBe("M1");
    expect(nextTableLabel(["M1", "M2"])).toBe("M3");
    expect(nextTableLabel(["M1", "M3"])).toBe("M2");
  });

  it("ignores case when checking what is taken", () => {
    expect(nextTableLabel(["m1"])).toBe("M2");
  });

  it("honours a custom prefix", () => {
    expect(nextTableLabel(["Box 1"], "Lounge ")).toBe("Lounge 1");
  });
});

describe("generateTables", () => {
  it("fits as many tables per row as the zone is wide", () => {
    const tables = generateTables({
      count: 6,
      seats: 6,
      shape: "ROUND",
      hasChairs: true,
      zoneWidth: 400,
    });
    expect(tables).toHaveLength(6);
    expect(tables.map((table) => table.label)).toEqual([
      "M1",
      "M2",
      "M3",
      "M4",
      "M5",
      "M6",
    ]);
    // A 60-unit round table plus its chairs is 90 wide, so three fit across
    // 400 units and the fourth starts a new row.
    const rows = new Set(tables.map((table) => table.posY));
    expect(rows.size).toBe(2);
    expect(tables[2].posY).toBe(tables[0].posY);
    expect(tables[3].posY).toBeGreaterThan(tables[0].posY);
    expect(tables[3].posX).toBe(tables[0].posX);
  });

  it("continues an existing numbering", () => {
    const tables = generateTables({
      count: 2,
      seats: 4,
      shape: "SQUARE",
      hasChairs: true,
      zoneWidth: 300,
      startAt: 5,
    });
    expect(tables.map((table) => table.label)).toEqual(["M5", "M6"]);
  });

  it("packs bare lounges tighter than chaired tables", () => {
    const options = {
      count: 4,
      seats: 8,
      shape: "ROUND" as const,
      zoneWidth: 300,
    };
    const bare = generateTables({ ...options, hasChairs: false });
    const chaired = generateTables({ ...options, hasChairs: true });
    expect(new Set(bare.map((t) => t.posY)).size).toBeLessThanOrEqual(
      new Set(chaired.map((t) => t.posY)).size,
    );
  });

  it("always fits at least one per row in a narrow zone", () => {
    const tables = generateTables({
      count: 3,
      seats: 6,
      shape: "RECT",
      hasChairs: true,
      zoneWidth: 40,
    });
    expect(new Set(tables.map((table) => table.posY)).size).toBe(3);
  });
});

describe("requiredZoneSize", () => {
  it("grows the zone to cover the tables and their chairs", () => {
    const tables = generateTables({
      count: 3,
      seats: 6,
      shape: "ROUND",
      hasChairs: true,
      zoneWidth: 400,
    });
    const size = requiredZoneSize(tables);
    const last = tables.at(-1)!;
    expect(size.width).toBeGreaterThan(last.posX + last.width);
    expect(size.height).toBeGreaterThan(last.posY + last.height);
  });
});

describe("dragZoneTo", () => {
  const canvas = { width: 1000, height: 700 };

  it("snaps the drop to the grid", () => {
    expect(
      dragZoneTo({
        from: { posX: 100, posY: 100 },
        delta: { dx: 23, dy: -17 },
        zone: { width: 200, height: 150 },
        canvas,
      }),
    ).toEqual({ posX: 120, posY: 80 });
  });

  it("never lets a zone leave the canvas", () => {
    expect(
      dragZoneTo({
        from: { posX: 900, posY: 600 },
        delta: { dx: 500, dy: 500 },
        zone: { width: 200, height: 150 },
        canvas,
      }),
    ).toEqual({ posX: 800, posY: 550 });

    expect(
      dragZoneTo({
        from: { posX: 10, posY: 10 },
        delta: { dx: -500, dy: -500 },
        zone: { width: 200, height: 150 },
        canvas,
      }),
    ).toEqual({ posX: 0, posY: 0 });
  });
});

describe("resizeZoneTo", () => {
  const canvas = { width: 1000, height: 700 };

  it("grows with the pointer", () => {
    expect(
      resizeZoneTo({
        from: { width: 200, height: 150 },
        delta: { dx: 64, dy: 32 },
        at: { posX: 100, posY: 100 },
        canvas,
      }),
    ).toEqual({ width: 260, height: 180 });
  });

  it("stretches along the zone's own axes when it is tilted", () => {
    const resized = resizeZoneTo({
      from: { width: 200, height: 150 },
      delta: { dx: 0, dy: 60 },
      at: { posX: 100, posY: 100 },
      canvas,
      rotation: 90,
    });
    // A zone turned a quarter clockwise has its own +x pointing down the
    // screen, so pulling the handle down makes it wider, not taller.
    expect(resized.width).toBe(260);
    expect(resized.height).toBe(150);
  });

  it("stops at the canvas edge and at the minimum size", () => {
    expect(
      resizeZoneTo({
        from: { width: 200, height: 150 },
        delta: { dx: 5000, dy: 5000 },
        at: { posX: 800, posY: 600 },
        canvas,
      }),
    ).toEqual({ width: 200, height: 100 });

    expect(
      resizeZoneTo({
        from: { width: 200, height: 150 },
        delta: { dx: -5000, dy: -5000 },
        at: { posX: 0, posY: 0 },
        canvas,
      }),
    ).toEqual({ width: 40, height: 40 });
  });
});

describe("dragTableTo", () => {
  const zone = { width: 400, height: 300 };
  const table = { width: 60, height: 60 };

  it("follows the pointer inside an upright zone", () => {
    expect(
      dragTableTo({
        from: { posX: 20, posY: 20 },
        delta: { dx: 100, dy: 50 },
        zoneRotation: 0,
        table,
        zone,
      }),
    ).toEqual({ posX: 120, posY: 70 });
  });

  it("turns the drag back when the zone is tilted", () => {
    // The zone is a quarter turn clockwise, so dragging right on screen has
    // to move the table *up* in the zone's own axes.
    const moved = dragTableTo({
      from: { posX: 100, posY: 100 },
      delta: { dx: 50, dy: 0 },
      zoneRotation: 90,
      table,
      zone,
    });
    expect(moved.posX).toBe(100);
    expect(moved.posY).toBe(50);
  });

  it("keeps the table inside its zone", () => {
    expect(
      dragTableTo({
        from: { posX: 300, posY: 200 },
        delta: { dx: 400, dy: 400 },
        zoneRotation: 0,
        table,
        zone,
      }),
    ).toEqual({ posX: 340, posY: 240 });
  });
});
