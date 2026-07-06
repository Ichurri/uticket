import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAX_PER_ZONE = 10;

export interface CartItem {
  /** Unique key within the cart: seat id for numbered seats, zone id for zone tickets */
  key: string;
  eventId: string;
  zoneId: string;
  seatId?: string;
  label: string;
  quantity: number;
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
    seat: { seatId: string; zoneId: string; label: string; unitPrice: number },
  ) => void;
  setZoneQuantity: (
    event: CartEventInfo,
    zone: { zoneId: string; label: string; unitPrice: number },
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
                    zoneId: seat.zoneId,
                    seatId: seat.seatId,
                    label: seat.label,
                    quantity: 1,
                    unitPrice: seat.unitPrice,
                  },
                ],
          };
        }),

      setZoneQuantity: (event, zone, quantity) =>
        set((state) => {
          const items = itemsForEvent(state, event.eventId);
          const clamped = Math.max(0, Math.min(quantity, MAX_PER_ZONE));
          const others = items.filter((item) => item.key !== zone.zoneId);
          return {
            eventId: event.eventId,
            eventTitle: event.eventTitle,
            items:
              clamped === 0
                ? others
                : [
                    ...others,
                    {
                      key: zone.zoneId,
                      eventId: event.eventId,
                      zoneId: zone.zoneId,
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
    { name: "boletavip-cart" },
  ),
);

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
