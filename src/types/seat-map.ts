export type SeatStatusDto = "AVAILABLE" | "RESERVED" | "SOLD";

export interface SeatDto {
  id: string;
  row: string;
  number: number;
  status: SeatStatusDto;
}

export interface ZoneDto {
  id: string;
  name: string;
  numbered: boolean;
  /** Final ticket price for this zone (base price × multiplier) */
  price: number;
  capacity: number;
  available: number;
  seats: SeatDto[];
}

export interface EventSeatMapDto {
  eventId: string;
  eventTitle: string;
  zones: ZoneDto[];
}
