import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAX_PER_ZONE = 10;

export interface CartItem {
  /** Unique key within the cart: seat id, event-table id, or event-zone id */
  key: string;
  eventId: string;
  /** EventZone id — the commercial row, not the physical zone */
  eventZoneId: string;
  /** Physical seat id, for SEATED zones */
  seatId?: string;
  /** EventTable id, for TABLES zones */
  eventTableId?: string;
  /** Spots taken inside the table; absent means the whole table */
  seats?: number;
  label: string;
  /** Line units. Always 1 for a seat and for a lounge — a lounge is bought
   * whole, and the people it admits live in `admits`, not here. */
  quantity: number;
  /** How many tickets this line is worth; only set for lounges */
  admits?: number;
  unitPrice: number;
}

interface CartEventInfo {
  eventId: string;
  eventTitle: string;
}

interface CartState {
  eventId: string | null;
  eventTitle: string | null;
  items: CartItem[];
  toggleSeat: (
    event: CartEventInfo,
    seat: {
      seatId: string;
      eventZoneId: string;
      label: string;
      unitPrice: number;
    },
  ) => void;
  toggleTable: (
    event: CartEventInfo,
    table: {
      eventTableId: string;
      eventZoneId: string;
      label: string;
      unitPrice: number;
      admits: number;
    },
  ) => void;
  setTableSeats: (
    event: CartEventInfo,
    table: {
      eventTableId: string;
      eventZoneId: string;
      label: string;
      unitPrice: number;
    },
    seats: number,
  ) => void;
  setZoneQuantity: (
    event: CartEventInfo,
    zone: { eventZoneId: string; label: string; unitPrice: number },
    quantity: number,
  ) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

/** The cart holds tickets for a single event; selecting another event resets it. */
function itemsForEvent(state: CartState, eventId: string): CartItem[] {
  return state.eventId === eventId ? state.items : [];
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      eventId: null,
      eventTitle: null,
      items: [],

      toggleSeat: (event, seat) =>
        set((state) => {
          const items = itemsForEvent(state, event.eventId);
          const exists = items.some((item) => item.key === seat.seatId);
          return {
            eventId: event.eventId,
            eventTitle: event.eventTitle,
            items: exists
              ? items.filter((item) => item.key !== seat.seatId)
              : [
                  ...items,
                  {
                    key: seat.seatId,
                    eventId: event.eventId,
                    eventZoneId: seat.eventZoneId,
                    seatId: seat.seatId,
                    label: seat.label,
                    quantity: 1,
                    unitPrice: seat.unitPrice,
                  },
                ],
          };
        }),

      // A whole table is indivisible: it is either in the cart or it is not.
      toggleTable: (event, table) =>
        set((state) => {
          const items = itemsForEvent(state, event.eventId);
          const exists = items.some((item) => item.key === table.eventTableId);
          return {
            eventId: event.eventId,
            eventTitle: event.eventTitle,
            items: exists
              ? items.filter((item) => item.key !== table.eventTableId)
              : [
                  ...items,
                  {
                    key: table.eventTableId,
                    eventId: event.eventId,
                    eventZoneId: table.eventZoneId,
                    eventTableId: table.eventTableId,
                    label: table.label,
                    quantity: 1,
                    admits: table.admits,
                    unitPrice: table.unitPrice,
                  },
                ],
          };
        }),

      // PER_SEAT zones sell spots inside a table, so this one has a count.
      setTableSeats: (event, table, seats) =>
        set((state) => {
          const items = itemsForEvent(state, event.eventId);
          const others = items.filter(
            (item) => item.key !== table.eventTableId,
          );
          return {
            eventId: event.eventId,
            eventTitle: event.eventTitle,
            items:
              seats <= 0
                ? others
                : [
                    ...others,
                    {
                      key: table.eventTableId,
                      eventId: event.eventId,
                      eventZoneId: table.eventZoneId,
                      eventTableId: table.eventTableId,
                      label: table.label,
                      quantity: 1,
                      seats,
                      admits: seats,
                      unitPrice: table.unitPrice,
                    },
                  ],
          };
        }),

      setZoneQuantity: (event, zone, quantity) =>
        set((state) => {
          const items = itemsForEvent(state, event.eventId);
          const clamped = Math.max(0, Math.min(quantity, MAX_PER_ZONE));
          const others = items.filter((item) => item.key !== zone.eventZoneId);
          return {
            eventId: event.eventId,
            eventTitle: event.eventTitle,
            items:
              clamped === 0
                ? others
                : [
                    ...others,
                    {
                      key: zone.eventZoneId,
                      eventId: event.eventId,
                      eventZoneId: zone.eventZoneId,
                      label: zone.label,
                      quantity: clamped,
                      unitPrice: zone.unitPrice,
                    },
                  ],
          };
        }),

      removeItem: (key) =>
        set((state) => ({
          items: state.items.filter((item) => item.key !== key),
        })),

      clear: () => set({ eventId: null, eventTitle: null, items: [] }),
    }),
    { name: "uticket-cart" },
  ),
);

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

/** Tickets the cart is worth. A lounge counts as the people it admits, not
 * as the single line unit it is charged as. */
export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + (item.admits ?? item.quantity), 0);
}
