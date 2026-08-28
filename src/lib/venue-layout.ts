/**
 * Pure geometry for the floor plan: where chairs sit around a table, how a
 * drag lands on the grid, how a bulk generation is laid out. No React and no
 * Prisma here on purpose — the editor and the buyer's map both draw from it,
 * and it is all unit-tested.
 *
 * Coordinate convention (the same one the migration and the seed produce):
 *   - zone.posX/posY are absolute inside the floor canvas
 *   - table.posX/posY and seat.posX/posY are RELATIVE to their zone's corner
 *   - a table's posX/posY is its top-left, like every other box here
 */

import type { TableShape } from "@/generated/prisma/enums";

/** Editor grid, in canvas units. */
export const GRID = 10;
/** Gap between the table edge and the chairs drawn around it. */
export const CHAIR_GAP = 9;
export const CHAIR_SIZE = 12;

export function snap(value: number, grid: number = GRID) {
  return Math.round(value / grid) * grid;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Rotate a vector by `degrees` around the origin. */
export function rotateVector(dx: number, dy: number, degrees: number) {
  if (degrees === 0) return { dx, dy };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

export interface Chair {
  /** Centre of the chair, relative to the centre of its table */
  x: number;
  y: number;
  /** Degrees; 0 = the chair sits above the table */
  angle: number;
}

/**
 * Split N chairs between the four sides of a rectangle, proportionally to how
 * long each side is, with the leftovers going to the longest sides first.
 * Order is top, right, bottom, left.
 */
export function splitSides(
  count: number,
  width: number,
  height: number,
): [number, number, number, number] {
  const lengths = [width, height, width, height];
  const perimeter = 2 * (width + height);
  if (count <= 0 || perimeter <= 0) return [0, 0, 0, 0];

  const exact = lengths.map((side) => (count * side) / perimeter);
  const counts = exact.map(Math.floor);
  let left = count - counts.reduce((sum, n) => sum + n, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; left > 0; i = (i + 1) % 4, left--) {
    counts[byRemainder[i].index]++;
  }
  return counts as [number, number, number, number];
}

/**
 * Where to draw the chairs of a table, relative to its centre. Round tables
 * get an even ring; square and rectangular ones get their sides shared out,
 * so a long table reads as 3 + 3 down the sides and 1 + 1 at the ends.
 */
export function chairPositions(table: {
  shape: TableShape;
  seats: number;
  width: number;
  height: number;
}): Chair[] {
  const count = Math.max(0, Math.min(table.seats, 50));
  if (count === 0) return [];

  if (table.shape === "ROUND") {
    const radius = Math.max(table.width, table.height) / 2 + CHAIR_GAP;
    return Array.from({ length: count }, (_, index) => {
      // Start at the top and go clockwise
      const degrees = (360 / count) * index;
      const rad = ((degrees - 90) * Math.PI) / 180;
      return {
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        angle: degrees,
      };
    });
  }

  const halfW = table.width / 2;
  const halfH = table.height / 2;
  const [top, right, bottom, left] = splitSides(
    count,
    table.width,
    table.height,
  );
  const chairs: Chair[] = [];

  const along = (n: number, length: number, index: number) =>
    -length / 2 + (length * (index + 0.5)) / n;

  for (let i = 0; i < top; i++) {
    chairs.push({
      x: along(top, table.width, i),
      y: -halfH - CHAIR_GAP,
      angle: 0,
    });
  }
  for (let i = 0; i < right; i++) {
    chairs.push({
      x: halfW + CHAIR_GAP,
      y: along(right, table.height, i),
      angle: 90,
    });
  }
  for (let i = 0; i < bottom; i++) {
    chairs.push({
      x: along(bottom, table.width, bottom - 1 - i),
      y: halfH + CHAIR_GAP,
      angle: 180,
    });
  }
  for (let i = 0; i < left; i++) {
    chairs.push({
      x: -halfW - CHAIR_GAP,
      y: along(left, table.height, left - 1 - i),
      angle: 270,
    });
  }
  return chairs;
}

/** How much room a table needs including its chairs, for layout purposes. */
export function tableFootprint(table: {
  shape: TableShape;
  width: number;
  height: number;
  hasChairs: boolean;
}) {
  const margin = table.hasChairs ? (CHAIR_GAP + CHAIR_SIZE / 2) * 2 : 0;
  return { width: table.width + margin, height: table.height + margin };
}

export const DEFAULT_TABLE_SIZE: Record<
  TableShape,
  { width: number; height: number }
> = {
  ROUND: { width: 60, height: 60 },
  SQUARE: { width: 60, height: 60 },
  RECT: { width: 110, height: 60 },
};

/** First unused `M1`, `M2`… for a new table in a zone. */
export function nextTableLabel(existing: string[], prefix = "M") {
  const taken = new Set(existing.map((label) => label.trim().toLowerCase()));
  for (let n = 1; n <= existing.length + 1; n++) {
    const candidate = `${prefix}${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${prefix}${existing.length + 1}`;
}

export interface GeneratedTable {
  label: string;
  seats: number;
  hasChairs: boolean;
  shape: TableShape;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Lay `count` tables out inside a zone, fitting as many per row as the zone is
 * wide. Positions are zone-relative and include room for the chairs.
 */
export function generateTables({
  count,
  seats,
  shape,
  hasChairs,
  zoneWidth,
  labelPrefix = "M",
  startAt = 1,
}: {
  count: number;
  seats: number;
  shape: TableShape;
  hasChairs: boolean;
  zoneWidth: number;
  labelPrefix?: string;
  startAt?: number;
}): GeneratedTable[] {
  const size = DEFAULT_TABLE_SIZE[shape];
  const footprint = tableFootprint({ ...size, shape, hasChairs });
  const gap = 16;
  const perRow = Math.max(
    1,
    Math.floor((zoneWidth - gap) / (footprint.width + gap)),
  );

  return Array.from({ length: count }, (_, index) => ({
    label: `${labelPrefix}${startAt + index}`,
    seats,
    hasChairs,
    shape,
    width: size.width,
    height: size.height,
    rotation: 0,
    posX: snap(
      gap +
        (index % perRow) * (footprint.width + gap) +
        (footprint.width - size.width) / 2,
    ),
    posY: snap(
      gap +
        Math.floor(index / perRow) * (footprint.height + gap) +
        (footprint.height - size.height) / 2,
    ),
  }));
}

/** The zone box a generated table grid needs, so the zone can grow to fit. */
export function requiredZoneSize(
  tables: {
    posX: number;
    posY: number;
    width: number;
    height: number;
    shape: TableShape;
    hasChairs: boolean;
  }[],
) {
  let width = 0;
  let height = 0;
  for (const table of tables) {
    const footprint = tableFootprint(table);
    const overhang = (footprint.width - table.width) / 2;
    width = Math.max(width, table.posX + table.width + overhang);
    height = Math.max(
      height,
      table.posY + table.height + (footprint.height - table.height) / 2,
    );
  }
  return { width: snap(width + 16), height: snap(height + 16) };
}

export interface Point {
  posX: number;
  posY: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Where a dragged zone lands: snapped to the grid and kept inside the canvas.
 * Pulled out of the canvas component so the arithmetic is testable without a
 * browser — the pointer plumbing on top of it is thin.
 */
export function dragZoneTo({
  from,
  delta,
  zone,
  canvas,
}: {
  from: Point;
  delta: { dx: number; dy: number };
  zone: Size;
  canvas: Size;
}): Point {
  return {
    posX: clamp(snap(from.posX + delta.dx), 0, Math.max(0, canvas.width - zone.width)),
    posY: clamp(
      snap(from.posY + delta.dy),
      0,
      Math.max(0, canvas.height - zone.height),
    ),
  };
}

/**
 * Where a resized zone ends up; it may never spill past the canvas edge. The
 * handle sits on a corner of the (possibly tilted) zone, so the drag is turned
 * back into the zone's own axes first — otherwise pulling the corner of a
 * rotated zone stretches it sideways.
 */
export function resizeZoneTo({
  from,
  delta,
  at,
  canvas,
  rotation = 0,
  min = 40,
}: {
  from: Size;
  delta: { dx: number; dy: number };
  at: Point;
  canvas: Size;
  rotation?: number;
  min?: number;
}): Size {
  const local = rotateVector(delta.dx, delta.dy, -rotation);
  return {
    width: clamp(snap(from.width + local.dx), min, canvas.width - at.posX),
    height: clamp(snap(from.height + local.dy), min, canvas.height - at.posY),
  };
}

/**
 * Where a dragged table lands inside its zone. The pointer moves in canvas
 * axes but the table's coordinates are the zone's, so a tilted zone has to
 * turn the drag back before applying it.
 */
export function dragTableTo({
  from,
  delta,
  zoneRotation,
  table,
  zone,
}: {
  from: Point;
  delta: { dx: number; dy: number };
  zoneRotation: number;
  table: Size;
  zone: Size;
}): Point {
  const local = rotateVector(delta.dx, delta.dy, -zoneRotation);
  return {
    posX: clamp(snap(from.posX + local.dx), 0, Math.max(0, zone.width - table.width)),
    posY: clamp(snap(from.posY + local.dy), 0, Math.max(0, zone.height - table.height)),
  };
}
