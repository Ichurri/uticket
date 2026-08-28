import type { ZoneType, TableShape } from "@/generated/prisma/enums";
import type { FloorLayoutInput } from "@/lib/validations/venue";

/**
 * What the editor holds while you drag things around. Every row carries a
 * `key` that never changes (React lists, selection) and, when it already
 * exists in the database, its `id` — that id is what turns the save into a
 * diff instead of a wipe, so an event's prices stay attached to its zones.
 */
export interface DraftTable {
  key: string;
  id?: string;
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

export interface DraftSeat {
  key: string;
  id?: string;
  row: string;
  number: number;
  posX: number;
  posY: number;
}

export interface DraftZone {
  key: string;
  id?: string;
  name: string;
  type: ZoneType;
  description: string | null;
  color: string;
  capacity: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  tables: DraftTable[];
  seats: DraftSeat[];
}

export interface DraftFloor {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  zones: DraftZone[];
}

export interface ServerFloor {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  zones: {
    id: string;
    name: string;
    type: ZoneType;
    description: string | null;
    color: string;
    capacity: number | null;
    posX: number;
    posY: number;
    width: number;
    height: number;
    rotation: number;
    tables: Omit<DraftTable, "key">[];
    seats: Omit<DraftSeat, "key">[];
  }[];
}

export function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function toDraftFloor(floor: ServerFloor): DraftFloor {
  return {
    id: floor.id,
    name: floor.name,
    canvasWidth: floor.canvasWidth,
    canvasHeight: floor.canvasHeight,
    zones: floor.zones.map((zone) => ({
      ...zone,
      key: newKey(),
      capacity: zone.capacity ?? 0,
      tables: zone.tables.map((table) => ({ ...table, key: newKey() })),
      seats: zone.seats.map((seat) => ({ ...seat, key: newKey() })),
    })),
  };
}

/** The client key never leaves the browser. */
function withoutKey<T extends { key: string }>({
  key,
  ...rest
}: T): Omit<T, "key"> {
  void key;
  return rest;
}

/** Strip the client keys and send only what each zone type actually sells. */
export function toLayoutPayload(floor: DraftFloor): FloorLayoutInput {
  return {
    name: floor.name,
    canvasWidth: floor.canvasWidth,
    canvasHeight: floor.canvasHeight,
    zones: floor.zones.map((zone, index) => ({
      id: zone.id,
      name: zone.name,
      type: zone.type,
      description: zone.description,
      color: zone.color,
      order: index,
      capacity: zone.type === "GENERAL" ? zone.capacity : undefined,
      posX: zone.posX,
      posY: zone.posY,
      width: zone.width,
      height: zone.height,
      rotation: zone.rotation,
      tables: zone.type === "TABLES" ? zone.tables.map(withoutKey) : [],
      seats: zone.type === "SEATED" ? zone.seats.map(withoutKey) : [],
    })),
  };
}

/** Same rule as the server: headcount, table seats, or seat rows. */
export function draftZoneCapacity(zone: DraftZone): number {
  if (zone.type === "TABLES") {
    return zone.tables.reduce((sum, table) => sum + table.seats, 0);
  }
  if (zone.type === "SEATED") return zone.seats.length;
  return zone.capacity;
}

export function draftFloorCapacity(floor: DraftFloor): number {
  return floor.zones.reduce((sum, zone) => sum + draftZoneCapacity(zone), 0);
}

export const ZONE_COLORS = [
  "#6D2BFF",
  "#879CFF",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#64748B",
];
