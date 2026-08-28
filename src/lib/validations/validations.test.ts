import { describe, expect, it } from "vitest";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "@/lib/validations/auth";
import { venueSchema } from "@/lib/validations/venue";
import { eventSchema } from "@/lib/validations/event";
import { createOrderSchema } from "@/lib/validations/order";
import { verifyTicketSchema } from "@/lib/validations/ticket";

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

describe("password schemas", () => {
  it("forgot requires a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "no" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(
      true,
    );
  });

  it("reset requires token and 8+ char password", () => {
    expect(
      resetPasswordSchema.safeParse({ token: "", password: "12345678" })
        .success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "t", password: "short" }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "t", password: "12345678" })
        .success,
    ).toBe(true);
  });

  it("change requires current password and 8+ char new one", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "",
        newPassword: "12345678",
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old-pass",
        newPassword: "short",
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old-pass",
        newPassword: "12345678",
      }).success,
    ).toBe(true);
  });
});

describe("venueSchema", () => {
  const base = {
    name: "Teatro",
    address: "Calle 1",
    city: "La Paz",
    isPublic: false,
  };
  const floor = (zones: unknown[]) => ({
    floors: [{ name: "Planta baja", order: 0, zones }],
  });

  it("requires at least one seat for a SEATED zone", () => {
    const result = venueSchema.safeParse({
      ...base,
      ...floor([{ name: "VIP", type: "SEATED", posX: 0, posY: 0 }]),
    });
    expect(result.success).toBe(false);
  });

  it("requires a capacity for a GENERAL zone", () => {
    const result = venueSchema.safeParse({
      ...base,
      ...floor([{ name: "General", type: "GENERAL", posX: 0, posY: 0 }]),
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one table for a TABLES zone", () => {
    const result = venueSchema.safeParse({
      ...base,
      ...floor([{ name: "Mesas", type: "TABLES", posX: 0, posY: 0 }]),
    });
    expect(result.success).toBe(false);
  });

  it("rejects tables repeating a label within the same zone", () => {
    const result = venueSchema.safeParse({
      ...base,
      ...floor([
        {
          name: "Mesas",
          type: "TABLES",
          posX: 0,
          posY: 0,
          tables: [
            { label: "M1", seats: 8, posX: 0, posY: 0 },
            { label: "m1", seats: 6, posX: 80, posY: 0 },
          ],
        },
      ]),
    });
    expect(result.success).toBe(false);
  });

  it("rejects seats repeating row and number", () => {
    const result = venueSchema.safeParse({
      ...base,
      ...floor([
        {
          name: "Platea",
          type: "SEATED",
          posX: 0,
          posY: 0,
          seats: [
            { row: "A", number: 1, posX: 0, posY: 0 },
            { row: "A", number: 1, posX: 28, posY: 0 },
          ],
        },
      ]),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown zone type", () => {
    const result = venueSchema.safeParse({
      ...base,
      ...floor([{ name: "Raro", type: "BOXES", posX: 0, posY: 0 }]),
    });
    expect(result.success).toBe(false);
  });

  it("coerces numeric strings from forms", () => {
    const result = venueSchema.parse({
      ...base,
      ...floor([
        {
          name: "Mesas",
          type: "TABLES",
          posX: "0",
          posY: "0",
          tables: [{ label: "M1", seats: "8", posX: "20", posY: "20" }],
        },
      ]),
    });
    const zone = result.floors[0].zones[0];
    expect(zone.tables?.[0].seats).toBe(8);
    expect(zone.posX).toBe(0);
  });

  it("requires at least one floor", () => {
    expect(venueSchema.safeParse({ ...base, floors: [] }).success).toBe(false);
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
    basePrice: "45",
  };

  it("accepts valid data and coerces price", () => {
    expect(eventSchema.parse(valid).basePrice).toBe(45);
  });

  it("rejects malformed date and time", () => {
    expect(eventSchema.safeParse({ ...valid, date: "10/09/2026" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...valid, time: "25:00" }).success).toBe(false);
  });

  it("only accepts /uploads/ paths or Vercel Blob URLs for images", () => {
    expect(
      eventSchema.safeParse({ ...valid, coverImage: "https://evil.com/x.png" })
        .success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        ...valid,
        coverImage: "https://evil.com/x.public.blob.vercel-storage.com/x.png",
      }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({ ...valid, coverImage: "/uploads/abc-123.png" })
        .success,
    ).toBe(true);
    expect(
      eventSchema.safeParse({
        ...valid,
        coverImage:
          "https://abc123xyz.public.blob.vercel-storage.com/uploads/a-1.png",
      }).success,
    ).toBe(true);
  });
});

describe("verifyTicketSchema", () => {
  it("accepts a UUID ticket code", () => {
    expect(
      verifyTicketSchema.safeParse({
        code: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      }).success,
    ).toBe(true);
  });

  it("rejects arbitrary strings", () => {
    expect(verifyTicketSchema.safeParse({ code: "hola-mundo" }).success).toBe(false);
    expect(verifyTicketSchema.safeParse({ code: "" }).success).toBe(false);
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
        zones: [{ eventZoneId: "ez1", quantity: 11 }],
      }).success,
    ).toBe(false);
  });

  it("accepts seats plus zones", () => {
    const parsed = createOrderSchema.parse({
      eventId: "e1",
      seatIds: ["s1", "s2"],
      zones: [{ eventZoneId: "ez1", quantity: 2 }],
    });
    expect(parsed.seatIds).toHaveLength(2);
    expect(parsed.tables).toEqual([]);
  });

  it("accepts an order made only of tables", () => {
    const parsed = createOrderSchema.parse({
      eventId: "e1",
      tables: [{ eventTableId: "et1" }, { eventTableId: "et2", seats: 2 }],
    });
    expect(parsed.tables).toHaveLength(2);
    expect(parsed.tables[1].seats).toBe(2);
    expect(parsed.seatIds).toEqual([]);
  });

  it("caps tables at 5 per order", () => {
    expect(
      createOrderSchema.safeParse({
        eventId: "e1",
        tables: Array.from({ length: 6 }, (_, i) => ({
          eventTableId: `et${i}`,
        })),
      }).success,
    ).toBe(false);
  });
});
