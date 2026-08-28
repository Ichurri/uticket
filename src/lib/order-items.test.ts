import { describe, expect, it } from "vitest";
import {
  orderItemLabel,
  orderItemTotal,
  orderItemsSummary,
  ticketLabel,
  ticketCountFor,
  inclusionSummary,
} from "@/lib/order-items";

const seatItem = {
  quantity: 1,
  seatsQuantity: null,
  eventZone: { zone: { name: "Platea" } },
  eventTable: null,
  eventSeat: { seat: { row: "A", number: 3 } },
};

const wholeTableItem = {
  quantity: 1,
  seatsQuantity: null,
  eventZone: { zone: { name: "VIP" } },
  eventTable: { table: { label: "M4", seats: 8 } },
  eventSeat: null,
};

const perSeatItem = {
  quantity: 1,
  seatsQuantity: 2,
  eventZone: { zone: { name: "VIP" } },
  eventTable: { table: { label: "M4", seats: 8 } },
  eventSeat: null,
};

const generalItem = {
  quantity: 4,
  seatsQuantity: null,
  eventZone: { zone: { name: "General" } },
  eventTable: null,
  eventSeat: null,
};

describe("orderItemLabel", () => {
  it("names the seat for numbered items", () => {
    expect(orderItemLabel(seatItem)).toBe("Platea · Asiento A3");
  });

  it("names the table and how many it seats when sold whole", () => {
    expect(orderItemLabel(wholeTableItem)).toBe("VIP · M4 (8 personas)");
  });

  it("counts the spots when the table is sold per seat", () => {
    expect(orderItemLabel(perSeatItem)).toBe("VIP · M4 × 2 lugares");
    expect(orderItemLabel({ ...perSeatItem, seatsQuantity: 1 })).toBe(
      "VIP · M4 × 1 lugar",
    );
  });

  it("singularises a one-person table", () => {
    expect(
      orderItemLabel({
        ...wholeTableItem,
        eventTable: { table: { label: "Box 1", seats: 1 } },
      }),
    ).toBe("VIP · Box 1 (1 persona)");
  });

  it("shows the quantity for general zones", () => {
    expect(orderItemLabel(generalItem)).toBe("General × 4");
  });

  it("joins a mixed order into one summary", () => {
    expect(orderItemsSummary([seatItem, wholeTableItem, generalItem])).toBe(
      "Platea · Asiento A3, VIP · M4 (8 personas), General × 4",
    );
  });
});

describe("ticketLabel", () => {
  it("reads the snapshot, not the live layout", () => {
    expect(
      ticketLabel({ zoneName: "Platea", tableLabel: null, seatLabel: "A3" }),
    ).toBe("Platea · Asiento A3");
    expect(
      ticketLabel({ zoneName: "VIP", tableLabel: "M4", seatLabel: null }),
    ).toBe("VIP · M4");
    expect(
      ticketLabel({ zoneName: "General", tableLabel: null, seatLabel: null }),
    ).toBe("General");
  });

  it("falls back when the snapshot is empty", () => {
    expect(
      ticketLabel({ zoneName: null, tableLabel: null, seatLabel: null }),
    ).toBe("Entrada general");
  });
});

describe("ticketCountFor", () => {
  it("issues one ticket per numbered seat", () => {
    expect(
      ticketCountFor({
        quantity: 1,
        seatsQuantity: null,
        eventSeatId: "es1",
        eventTable: null,
      }),
    ).toBe(1);
  });

  it("issues one ticket per seat of a whole table", () => {
    expect(
      ticketCountFor({
        quantity: 1,
        seatsQuantity: null,
        eventSeatId: null,
        eventTable: { table: { seats: 8 } },
      }),
    ).toBe(8);
  });

  it("issues one ticket per spot in PER_SEAT mode", () => {
    expect(
      ticketCountFor({
        quantity: 1,
        seatsQuantity: 3,
        eventSeatId: null,
        eventTable: { table: { seats: 8 } },
      }),
    ).toBe(3);
  });

  it("issues `quantity` tickets for a general zone", () => {
    expect(
      ticketCountFor({
        quantity: 4,
        seatsQuantity: null,
        eventSeatId: null,
        eventTable: null,
      }),
    ).toBe(4);
  });
});

describe("inclusionSummary", () => {
  it("says nothing when the price only buys the spot", () => {
    expect(
      inclusionSummary({
        inclusionType: "NONE",
        inclusionValue: null,
        inclusionNote: null,
      }),
    ).toBeNull();
  });

  it("spells out a consumption credit", () => {
    expect(
      inclusionSummary({
        inclusionType: "CONSUMPTION_CREDIT",
        inclusionValue: 400,
        inclusionNote: null,
      }),
    ).toBe("Incluye Bs 400 de consumo");
  });

  it("prefers the organizer's own wording for a bottle", () => {
    expect(
      inclusionSummary({
        inclusionType: "BOTTLE",
        inclusionValue: null,
        inclusionNote: "1 botella nacional + 4 mixers",
      }),
    ).toBe("1 botella nacional + 4 mixers");
  });

  it("falls back to a generic line when there is no note", () => {
    expect(
      inclusionSummary({
        inclusionType: "BOTTLE",
        inclusionValue: null,
        inclusionNote: null,
      }),
    ).toBe("Incluye botella");
  });
});

describe("orderItemTotal", () => {
  it("prices a whole table once", () => {
    expect(
      orderItemTotal({ unitPrice: 800, quantity: 1, seatsQuantity: null }),
    ).toBe(800);
  });

  it("prices spots by how many were taken", () => {
    expect(
      orderItemTotal({ unitPrice: 120, quantity: 1, seatsQuantity: 3 }),
    ).toBe(360);
  });

  it("prices general tickets by quantity", () => {
    expect(
      orderItemTotal({ unitPrice: 55, quantity: 4, seatsQuantity: null }),
    ).toBe(220);
  });
});
