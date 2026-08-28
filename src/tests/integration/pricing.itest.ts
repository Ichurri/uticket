import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: { id: "", role: "ORGANIZER", name: "Test", email: "test@test.local" },
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireRole: async (...roles: string[]) => {
      if (!authState.user.id) {
        return {
          error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
        };
      }
      if (!roles.includes(authState.user.role)) {
        return {
          error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }),
        };
      }
      return { session: { user: authState.user } };
    },
  };
});

import {
  GET as readPricing,
  PUT as savePricing,
} from "@/app/api/events/[id]/pricing/route";
import { prisma } from "@/lib/prisma";
import {
  cleanDatabase,
  createApprovedEvent,
  createBuyer,
  createEventAtVenue,
  createTableZone,
  putZoneOnSale,
} from "./helpers";

function actAs(user: { id: string; role?: string }) {
  authState.user = { ...authState.user, role: "ORGANIZER", ...user };
}

function pricingRequest(body: unknown) {
  return new Request("http://test.local/api/events/e/pricing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await cleanDatabase();
});

describe("PUT /api/events/[id]/pricing", () => {
  it("sets the zone price, the table overrides and what they include", async () => {
    const { organizer, floor, event } = await createApprovedEvent();
    actAs({ id: organizer.id });
    const { zone, tables } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);
    const eventTables = await prisma.eventTable.findMany({
      where: { eventZoneId: eventZone.id },
      include: { table: true },
      orderBy: { table: { label: "asc" } },
    });

    const response = await savePricing(
      pricingRequest({
        zones: [
          {
            eventZoneId: eventZone.id,
            price: "800",
            defaultInclusionType: "CONSUMPTION_CREDIT",
            defaultInclusionValue: "400",
            tables: [
              { eventTableId: eventTables[0].id, price: "1200" },
              { eventTableId: eventTables[1].id },
            ],
          },
        ],
      }),
      context(event.id),
    );
    expect(response.status).toBe(200);

    const saved = await prisma.eventZone.findUniqueOrThrow({
      where: { id: eventZone.id },
      include: { eventTables: { include: { table: true } } },
    });
    expect(Number(saved.price)).toBe(800);
    expect(saved.defaultInclusionType).toBe("CONSUMPTION_CREDIT");
    expect(Number(saved.defaultInclusionValue)).toBe(400);

    const m1 = saved.eventTables.find((row) => row.table.label === "M1")!;
    const m2 = saved.eventTables.find((row) => row.table.label === "M2")!;
    expect(Number(m1.price)).toBe(1200);
    // No override: the zone price is what applies
    expect(m2.price).toBeNull();
    expect(tables).toHaveLength(2);
  });

  it("stores the sales window as Bolivia time", async () => {
    const { organizer, event, eventZone } = await createApprovedEvent();
    actAs({ id: organizer.id });

    const response = await savePricing(
      pricingRequest({
        zones: [
          {
            eventZoneId: eventZone.id,
            price: "100",
            salesStartAt: "2026-10-15T22:00",
          },
        ],
      }),
      context(event.id),
    );
    expect(response.status).toBe(200);

    const saved = await prisma.eventZone.findUniqueOrThrow({
      where: { id: eventZone.id },
    });
    expect(saved.salesStartAt?.toISOString()).toBe("2026-10-16T02:00:00.000Z");
  });

  it("takes a zone off sale without touching the plan", async () => {
    const { organizer, event, eventZone, zone } = await createApprovedEvent();
    actAs({ id: organizer.id });

    await savePricing(
      pricingRequest({
        zones: [{ eventZoneId: eventZone.id, price: "100", isEnabled: false }],
      }),
      context(event.id),
    );

    expect(
      (await prisma.eventZone.findUniqueOrThrow({ where: { id: eventZone.id } }))
        .isEnabled,
    ).toBe(false);
    // The physical zone is untouched — another event still sells it
    expect(await prisma.zone.findUnique({ where: { id: zone.id } })).not.toBeNull();
  });

  it("blocks a free table and leaves a sold one alone", async () => {
    const { organizer, floor, event } = await createApprovedEvent();
    actAs({ id: organizer.id });
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);
    const eventTables = await prisma.eventTable.findMany({
      where: { eventZoneId: eventZone.id },
      include: { table: true },
      orderBy: { table: { label: "asc" } },
    });
    await prisma.eventTable.update({
      where: { id: eventTables[1].id },
      data: { status: "SOLD" },
    });

    const response = await savePricing(
      pricingRequest({
        zones: [
          {
            eventZoneId: eventZone.id,
            price: "500",
            tables: [
              { eventTableId: eventTables[0].id, blocked: true },
              // The form was built before M2 sold and still says "on sale":
              // honouring that would put a sold table back on the market.
              { eventTableId: eventTables[1].id, blocked: false, price: "900" },
            ],
          },
        ],
      }),
      context(event.id),
    );
    expect(response.status).toBe(200);

    const after = await prisma.eventTable.findMany({
      where: { eventZoneId: eventZone.id },
      include: { table: true },
      orderBy: { table: { label: "asc" } },
    });
    expect(after[0].status).toBe("BLOCKED");
    expect(after[1].status).toBe("SOLD");
    // Its price still updates: that only affects the next buyer
    expect(Number(after[1].price)).toBe(900);
  });

  it("reports the tables it refused to block", async () => {
    const { organizer, floor, event } = await createApprovedEvent();
    actAs({ id: organizer.id });
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);
    const sold = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id },
      include: { table: true },
    });
    await prisma.eventTable.update({
      where: { id: sold.id },
      data: { status: "SOLD" },
    });

    const response = await savePricing(
      pricingRequest({
        zones: [
          {
            eventZoneId: eventZone.id,
            price: "500",
            tables: [{ eventTableId: sold.id, blocked: true }],
          },
        ],
      }),
      context(event.id),
    );
    const body = await response.json();
    expect(body.skipped).toEqual([sold.table.label]);
  });

  it("will not change the sale mode once a table is taken", async () => {
    const { organizer, floor, event } = await createApprovedEvent();
    actAs({ id: organizer.id });
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);
    await prisma.eventTable.updateMany({
      where: { eventZoneId: eventZone.id },
      data: { status: "SOLD" },
    });

    const response = await savePricing(
      pricingRequest({
        zones: [
          {
            eventZoneId: eventZone.id,
            price: "500",
            tableSaleMode: "PER_SEAT",
            seatPrice: "80",
          },
        ],
      }),
      context(event.id),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("forma de venta");
  });

  it("still lets the sale mode change when a table is merely blocked", async () => {
    const { organizer, floor, event } = await createApprovedEvent();
    actAs({ id: organizer.id });
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);
    await prisma.eventTable.updateMany({
      where: { eventZoneId: eventZone.id },
      data: { status: "BLOCKED" },
    });

    const response = await savePricing(
      pricingRequest({
        zones: [
          {
            eventZoneId: eventZone.id,
            price: "500",
            tableSaleMode: "PER_SEAT",
            seatPrice: "80",
          },
        ],
      }),
      context(event.id),
    );
    expect(response.status).toBe(200);
    expect(
      (await prisma.eventZone.findUniqueOrThrow({ where: { id: eventZone.id } }))
        .tableSaleMode,
    ).toBe("PER_SEAT");
  });

  it("will not cut the stock below what is already sold", async () => {
    const { organizer, event, eventZone } = await createApprovedEvent({
      freeZoneCapacity: 50,
    });
    const buyer = await createBuyer();
    actAs({ id: organizer.id });

    await prisma.order.create({
      data: {
        buyerId: buyer.id,
        eventId: event.id,
        totalAmount: 400,
        expiresAt: new Date(Date.now() + 900_000),
        status: "CONFIRMED",
        items: {
          create: { quantity: 4, unitPrice: 100, eventZoneId: eventZone.id },
        },
      },
    });

    const tooSmall = await savePricing(
      pricingRequest({
        zones: [
          { eventZoneId: eventZone.id, price: "100", capacityForSale: "3" },
        ],
      }),
      context(event.id),
    );
    expect(tooSmall.status).toBe(409);
    expect((await tooSmall.json()).error).toContain("ya vendiste 4");

    const exact = await savePricing(
      pricingRequest({
        zones: [
          { eventZoneId: eventZone.id, price: "100", capacityForSale: "4" },
        ],
      }),
      context(event.id),
    );
    expect(exact.status).toBe(200);
  });

  it("rejects a zone that belongs to another event", async () => {
    const { organizer, venue, event } = await createApprovedEvent();
    actAs({ id: organizer.id });
    const other = await createEventAtVenue({
      venueId: venue.id,
      organizerId: organizer.id,
      title: "Otro evento",
    });
    const zone = await prisma.zone.findFirstOrThrow({
      where: { floor: { venueId: venue.id } },
    });
    const foreign = await putZoneOnSale(other.id, zone.id);

    const response = await savePricing(
      pricingRequest({
        zones: [{ eventZoneId: foreign.id, price: "999" }],
      }),
      context(event.id),
    );
    expect(response.status).toBe(400);
  });

  it("keeps another organizer out", async () => {
    const { event, eventZone } = await createApprovedEvent();
    const intruder = await prisma.user.create({
      data: {
        email: `other-${Date.now()}@test.local`,
        name: "Otro",
        role: "ORGANIZER",
        emailVerified: new Date(),
      },
    });
    actAs({ id: intruder.id });

    const response = await savePricing(
      pricingRequest({ zones: [{ eventZoneId: eventZone.id, price: "1" }] }),
      context(event.id),
    );
    expect(response.status).toBe(403);
  });

  it("refuses to price a cancelled event", async () => {
    const { organizer, event, eventZone } = await createApprovedEvent();
    actAs({ id: organizer.id });
    await prisma.event.update({
      where: { id: event.id },
      data: { status: "CANCELLED" },
    });

    const response = await savePricing(
      pricingRequest({ zones: [{ eventZoneId: eventZone.id, price: "200" }] }),
      context(event.id),
    );
    expect(response.status).toBe(409);
  });
});

describe("GET /api/events/[id]/pricing", () => {
  it("hands back the setup another event can copy", async () => {
    const { organizer, floor, event } = await createApprovedEvent();
    actAs({ id: organizer.id });
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 700, {
      tableSaleMode: "PER_SEAT",
      seatPrice: 90,
    });

    const response = await readPricing(
      new Request("http://test.local"),
      context(event.id),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const tablesZone = body.zones.find(
      (row: { eventZoneId: string }) => row.eventZoneId === eventZone.id,
    );
    expect(tablesZone.price).toBe(700);
    expect(tablesZone.tableSaleMode).toBe("PER_SEAT");
    expect(tablesZone.seatPrice).toBe(90);
    // The physical ids are what let the copy match zone to zone
    expect(tablesZone.zoneId).toBe(zone.id);
    expect(tablesZone.tables).toHaveLength(2);
    expect(tablesZone.tables[0].label).toBe("M1");
  });
});
