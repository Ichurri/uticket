import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema } from "@/lib/validations/auth";
import { venueSchema } from "@/lib/validations/venue";
import { eventSchema } from "@/lib/validations/event";
import { createOrderSchema } from "@/lib/validations/order";

describe("registerSchema", () => {
  it("accepts valid data and defaults wantsOrganizer to false", () => {
    const parsed = registerSchema.parse({
      name: "Juan Pérez",
      email: "juan@test.com",
      password: "12345678",
    });
    expect(parsed.wantsOrganizer).toBe(false);
  });

  it("rejects short passwords and bad emails", () => {
    expect(
      registerSchema.safeParse({ name: "J", email: "no", password: "123" })
        .success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: "juan@test.com", password: "short" })
        .success,
    ).toBe(false);
  });
});

describe("venueSchema", () => {
  const base = { name: "Teatro", address: "Calle 1", city: "La Paz" };

  it("requires rows/seatsPerRow for numbered zones", () => {
    const result = venueSchema.safeParse({
      ...base,
      zones: [{ name: "VIP", priceMultiplier: 1.5, numbered: true }],
    });
    expect(result.success).toBe(false);
  });

  it("requires capacity for free zones", () => {
    const result = venueSchema.safeParse({
      ...base,
      zones: [{ name: "General", priceMultiplier: 1, numbered: false }],
    });
    expect(result.success).toBe(false);
  });

  it("coerces numeric strings from forms", () => {
    const result = venueSchema.parse({
      ...base,
      zones: [
        {
          name: "VIP",
          priceMultiplier: "1.5",
          numbered: true,
          rows: "3",
          seatsPerRow: "4",
        },
      ],
    });
    expect(result.zones[0].rows).toBe(3);
    expect(result.zones[0].priceMultiplier).toBe(1.5);
  });

  it("requires at least one zone", () => {
    expect(venueSchema.safeParse({ ...base, zones: [] }).success).toBe(false);
  });
});

describe("eventSchema", () => {
  const valid = {
    title: "Show de prueba",
    description: "Una descripción suficientemente larga.",
    category: "Comedia",
    date: "2026-09-10",
    time: "20:30",
    venueId: "v1",
    price: "45",
  };

  it("accepts valid data and coerces price", () => {
    expect(eventSchema.parse(valid).price).toBe(45);
  });

  it("rejects malformed date and time", () => {
    expect(eventSchema.safeParse({ ...valid, date: "10/09/2026" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...valid, time: "25:00" }).success).toBe(false);
  });

  it("only accepts /uploads/ paths for images", () => {
    expect(
      eventSchema.safeParse({ ...valid, coverImage: "https://evil.com/x.png" })
        .success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({ ...valid, coverImage: "/uploads/abc-123.png" })
        .success,
    ).toBe(true);
  });
});

describe("createOrderSchema", () => {
  it("rejects an empty order", () => {
    expect(
      createOrderSchema.safeParse({ eventId: "e1", seatIds: [], zones: [] })
        .success,
    ).toBe(false);
  });

  it("caps zone quantity at 10", () => {
    expect(
      createOrderSchema.safeParse({
        eventId: "e1",
        seatIds: [],
        zones: [{ zoneId: "z1", quantity: 11 }],
      }).success,
    ).toBe(false);
  });

  it("accepts seats plus zones", () => {
    const parsed = createOrderSchema.parse({
      eventId: "e1",
      seatIds: ["s1", "s2"],
      zones: [{ zoneId: "z1", quantity: 2 }],
    });
    expect(parsed.seatIds).toHaveLength(2);
  });
});
