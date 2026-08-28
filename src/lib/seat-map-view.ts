import type {
  FloorDto,
  SeatDto,
  TableDto,
  TableSaleModeDto,
  ZoneDto,
} from "@/types/seat-map";

/** Spots still free inside a table sold by the spot. */
export function tableFreeSpots(table: TableDto) {
  return Math.max(0, table.seats - table.seatsSold);
}

/**
 * Whether the buyer can still take something here. It differs by sale mode:
 * a table on hold for someone else is gone if it sells whole, but in PER_SEAT
 * mode the spots that hold did not take are still on the market.
 */
export function tableIsTaken(table: TableDto, mode: TableSaleModeDto) {
  if (table.status === "SOLD" || table.status === "BLOCKED") return true;
  if (mode === "PER_SEAT") return tableFreeSpots(table) <= 0;
  return table.status !== "AVAILABLE";
}

export function seatIsTaken(seat: SeatDto) {
  return seat.status !== "AVAILABLE";
}

export function zoneIsSoldOut(zone: ZoneDto) {
  return zone.available <= 0;
}

/**
 * Whether this floor was actually drawn. A venue whose plan nobody ever
 * opened has every zone sitting at the origin on top of the others; showing
 * that as a map would be a lie, so the buyer just gets the lists.
 */
export function floorHasLayout(floor: FloorDto) {
  if (floor.zones.length === 0) return false;
  if (floor.zones.length === 1) return true;
  const spots = new Set(floor.zones.map((zone) => `${zone.posX},${zone.posY}`));
  return spots.size > 1;
}

/** The box that holds every zone of the floor — what the map opens showing. */
export function floorBounds(floor: FloorDto) {
  if (floor.zones.length === 0) {
    return { posX: 0, posY: 0, width: floor.canvasWidth, height: floor.canvasHeight };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const zone of floor.zones) {
    minX = Math.min(minX, zone.posX);
    minY = Math.min(minY, zone.posY);
    maxX = Math.max(maxX, zone.posX + zone.width);
    maxY = Math.max(maxY, zone.posY + zone.height);
  }
  return { posX: minX, posY: minY, width: maxX - minX, height: maxY - minY };
}

/** The smallest thing worth tapping in a zone, in canvas units. */
export function smallestTarget(zone: ZoneDto) {
  if (zone.type === "TABLES") {
    return zone.tables.reduce(
      (min, table) => Math.min(min, table.width, table.height),
      Infinity,
    );
  }
  if (zone.type === "SEATED") return zone.seats.length > 0 ? 20 : Infinity;
  return Math.min(zone.width, zone.height);
}

/** One place for the label a cart line carries, so the map and the list agree. */
export function tableCartLabel(zone: ZoneDto, table: TableDto) {
  return `${zone.name} · ${table.label}`;
}

export function seatCartLabel(zone: ZoneDto, seat: SeatDto) {
  return `${zone.name} · Asiento ${seat.row}${seat.number}`;
}

/** DOM id of a zone's section in the list, so the map can scroll to it. */
export function zoneSectionId(zone: { id: string }) {
  return `zona-${zone.id}`;
}
