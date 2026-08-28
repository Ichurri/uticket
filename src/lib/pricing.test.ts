import { describe, expect, it } from "vitest";
import { boliviaLocalToUtc, utcToBoliviaLocal } from "@/lib/utils";
import {
  eventPricingSchema,
  eventZonePricingSchema,
} from "@/lib/validations/pricing";

describe("Bolivia local ↔ UTC", () => {
  it("reads what the organizer typed as Bolivia time", () => {
    // 22:00 in La Paz is 02:00 UTC the next day
    expect(boliviaLocalToUtc("2026-10-15T22:00").toISOString()).toBe(
      "2026-10-16T02:00:00.000Z",
    );
  });

  it("puts a stored instant back into the input", () => {
    expect(utcToBoliviaLocal(new Date("2026-10-16T02:00:00.000Z"))).toBe(
      "2026-10-15T22:00",
    );
  });

  it("round-trips", () => {
    const typed = "2026-01-02T08:30";
    expect(utcToBoliviaLocal(boliviaLocalToUtc(typed))).toBe(typed);
  });
});

const baseZone = {
  eventZoneId: "ez1",
  price: "150",
  isEnabled: true,
};

describe("eventZonePricingSchema", () => {
  it("takes a plain zone with just a price", () => {
    const parsed = eventZonePricingSchema.safeParse(baseZone);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.price).toBe(150);
    expect(parsed.data?.tableSaleMode).toBe("WHOLE_TABLE");
    expect(parsed.data?.tables).toEqual([]);
  });

  it("refuses a free or negative price", () => {
    expect(eventZonePricingSchema.safeParse({ ...baseZone, price: "0" }).success)
      .toBe(false);
    expect(eventZonePricingSchema.safeParse({ ...baseZone, price: "-5" }).success)
      .toBe(false);
  });

  it("treats an empty override as 'use the zone price'", () => {
    const parsed = eventZonePricingSchema.safeParse({
      ...baseZone,
      tables: [{ eventTableId: "et1", price: "", seatPrice: "" }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.tables[0].price).toBeUndefined();
    expect(parsed.data?.tables[0].blocked).toBe(false);
  });

  it("will not sell by the spot without a price per spot", () => {
    const parsed = eventZonePricingSchema.safeParse({
      ...baseZone,
      tableSaleMode: "PER_SEAT",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain("precio por lugar");
  });

  it("accepts PER_SEAT once the spot price is there", () => {
    expect(
      eventZonePricingSchema.safeParse({
        ...baseZone,
        tableSaleMode: "PER_SEAT",
        seatPrice: "40",
      }).success,
    ).toBe(true);
  });

  it("asks how much consumption is included", () => {
    const parsed = eventZonePricingSchema.safeParse({
      ...baseZone,
      defaultInclusionType: "CONSUMPTION_CREDIT",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain("monto");
  });

  it("refuses a window that closes before it opens", () => {
    const parsed = eventZonePricingSchema.safeParse({
      ...baseZone,
      salesStartAt: "2026-10-15T20:00",
      salesEndAt: "2026-10-15T18:00",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toContain("cerrar antes de abrir");
  });

  it("leaves the window open when both ends are empty", () => {
    const parsed = eventZonePricingSchema.safeParse({
      ...baseZone,
      salesStartAt: "",
      salesEndAt: "",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.salesStartAt).toBeUndefined();
  });

  it("catches a table that promises consumption without saying how much", () => {
    const parsed = eventZonePricingSchema.safeParse({
      ...baseZone,
      tables: [{ eventTableId: "et1", inclusionType: "CONSUMPTION_CREDIT" }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].path).toEqual([
      "tables",
      0,
      "inclusionValue",
    ]);
  });
});

describe("eventPricingSchema", () => {
  it("needs at least one zone", () => {
    expect(eventPricingSchema.safeParse({ zones: [] }).success).toBe(false);
  });

  it("parses a whole payload", () => {
    const parsed = eventPricingSchema.safeParse({
      zones: [
        { ...baseZone, capacityForSale: "80" },
        {
          eventZoneId: "ez2",
          price: "800",
          tableSaleMode: "PER_SEAT",
          seatPrice: "120",
          defaultInclusionType: "BOTTLE",
          defaultInclusionNote: "1 botella nacional",
          tables: [
            { eventTableId: "et1", price: "1000", blocked: true },
            { eventTableId: "et2" },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.zones[0].capacityForSale).toBe(80);
    expect(parsed.data?.zones[1].tables[0].blocked).toBe(true);
    expect(parsed.data?.zones[1].defaultInclusionNote).toBe("1 botella nacional");
  });
});
