import { beforeEach, describe, expect, it } from "vitest";
import {
  useCartStore,
  cartTotal,
  cartCount,
  MAX_PER_ZONE,
} from "@/stores/cart-store";

const event = { eventId: "e1", eventTitle: "Evento 1" };
const otherEvent = { eventId: "e2", eventTitle: "Evento 2" };
const seatA1 = { seatId: "s1", zoneId: "z1", label: "VIP · A1", unitPrice: 90 };
const seatA2 = { seatId: "s2", zoneId: "z1", label: "VIP · A2", unitPrice: 90 };
const general = { zoneId: "zg", label: "General", unitPrice: 60 };

const state = () => useCartStore.getState();

beforeEach(() => {
  state().clear();
});

describe("toggleSeat", () => {
  it("adds and removes seats", () => {
    state().toggleSeat(event, seatA1);
    state().toggleSeat(event, seatA2);
    expect(state().items).toHaveLength(2);

    state().toggleSeat(event, seatA1);
    expect(state().items.map((item) => item.key)).toEqual(["s2"]);
  });

  it("resets the cart when switching events", () => {
    state().toggleSeat(event, seatA1);
    state().toggleSeat(otherEvent, seatA2);
    expect(state().eventId).toBe("e2");
    expect(state().items).toHaveLength(1);
    expect(state().items[0].key).toBe("s2");
  });
});

describe("setZoneQuantity", () => {
  it("adds zone tickets and computes totals", () => {
    state().toggleSeat(event, seatA1);
    state().setZoneQuantity(event, general, 3);
    expect(cartCount(state().items)).toBe(4);
    expect(cartTotal(state().items)).toBe(90 + 180);
  });

  it("clamps to MAX_PER_ZONE", () => {
    state().setZoneQuantity(event, general, 99);
    expect(state().items[0].quantity).toBe(MAX_PER_ZONE);
  });

  it("removes the item at quantity 0", () => {
    state().setZoneQuantity(event, general, 2);
    state().setZoneQuantity(event, general, 0);
    expect(state().items).toHaveLength(0);
  });
});

describe("removeItem / clear", () => {
  it("removes a single item", () => {
    state().toggleSeat(event, seatA1);
    state().removeItem("s1");
    expect(state().items).toHaveLength(0);
  });

  it("clear resets event info", () => {
    state().toggleSeat(event, seatA1);
    state().clear();
    expect(state().eventId).toBeNull();
    expect(state().eventTitle).toBeNull();
    expect(state().items).toHaveLength(0);
  });
});
