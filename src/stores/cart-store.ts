import { create } from "zustand";

export interface CartItem {
  /** Unique key within the cart: seat id for numbered seats, zone id for zone tickets */
  key: string;
  eventId: string;
  zoneId?: string;
  seatId?: string;
  label: string;
  quantity: number;
  unitPrice: number;
}

interface CartState {
  eventId: string | null;
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  total: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  eventId: null,
  items: [],

  addItem: (item) =>
    set((state) => {
      // The cart holds tickets for a single event at a time
      const sameEvent = state.eventId === item.eventId;
      const items = sameEvent ? state.items : [];

      const existing = items.find((i) => i.key === item.key);
      if (existing) {
        return {
          eventId: item.eventId,
          items: items.map((i) =>
            i.key === item.key
              ? { ...i, quantity: i.quantity + item.quantity }
              : i,
          ),
        };
      }
      return { eventId: item.eventId, items: [...items, item] };
    }),

  updateQuantity: (key, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((i) => i.key !== key)
          : state.items.map((i) => (i.key === key ? { ...i, quantity } : i)),
    })),

  removeItem: (key) =>
    set((state) => ({ items: state.items.filter((i) => i.key !== key) })),

  clear: () => set({ eventId: null, items: [] }),

  total: () =>
    get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
}));
