export type SaleStatusDto = "AVAILABLE" | "HELD" | "SOLD" | "BLOCKED";

export type ZoneTypeDto = "GENERAL" | "TABLES" | "SEATED";

export type TableShapeDto = "ROUND" | "SQUARE" | "RECT";

export type TableSaleModeDto = "WHOLE_TABLE" | "PER_SEAT";

export interface SeatDto {
  /** Physical seat id — what the buyer sends at checkout */
  id: string;
  row: string;
  number: number;
  posX: number;
  posY: number;
  price: number;
  status: SaleStatusDto;
}

export interface TableDto {
  /** EventTable id — what the buyer sends at checkout */
  id: string;
  label: string;
  /** Physical capacity */
  seats: number;
  /** Spots already taken; only meaningful in PER_SEAT mode */
  seatsSold: number;
  /** Whether the organizer drew chairs around it, or a bare lounge */
  hasChairs: boolean;
  shape: TableShapeDto;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  /** Price of the whole table */
  price: number;
  /** Price of one spot inside it, when the zone sells PER_SEAT */
  seatPrice: number;
  /** "Incluye Bs 400 de consumo", "1 botella nacional + 4 mixers"… */
  inclusion: string | null;
  status: SaleStatusDto;
}

export interface ZoneDto {
  /** EventZone id — what the buyer sends for GENERAL zones */
  id: string;
  zoneId: string;
  name: string;
  type: ZoneTypeDto;
  description: string | null;
  color: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  /** Base price of the zone; tables and seats may override it */
  price: number;
  tableSaleMode: TableSaleModeDto;
  /** People it can still take */
  available: number;
  capacity: number;
  tables: TableDto[];
  seats: SeatDto[];
}

export interface FloorDto {
  id: string;
  name: string;
  order: number;
  canvasWidth: number;
  canvasHeight: number;
  backgroundImage: string | null;
  zones: ZoneDto[];
}

export interface EventSeatMapDto {
  eventId: string;
  eventTitle: string;
  floors: FloorDto[];
}
