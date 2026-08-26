import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: { id: "", role: "BUYER", name: "Test", email: "test@test.local" },
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

import { POST as createOrder } from "@/app/api/orders/route";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import {
  cleanDatabase,
  createApprovedEvent,
  createBuyer,
  createEventAtVenue,
  jsonRequest,
} from "./helpers";

function actAs(user: { id: string; role: string }) {
  authState.user = { ...authState.user, ...user };
}

function orderRequest(body: unknown) {
  return jsonRequest("http://test.local/api/orders", body);
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("POST /api/orders", () => {
  it("creates a pending order in a free-capacity zone", async () => {
    const buyer = await createBuyer();
    const { event, zone } = await createApprovedEvent();
    actAs({ id: buyer.id, role: "BUYER" });

    const response = await createOrder(
      orderRequest({
        eventId: event.id,
        seatIds: [],
        zones: [{ zoneId: zone.id, quantity: 2 }],
      }),
    );
    expect(response.status).toBe(201);

    const order = await prisma.order.findFirstOrThrow({
      where: { buyerId: buyer.id },
    });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(Number(order.totalAmount)).toBe(200);
  });

  it("rejects orders exceeding the zone capacity", async () => {
    const buyer = await createBuyer();
    const { event, zone } = await createApprovedEvent({ freeZoneCapacity: 3 });
    actAs({ id: buyer.id, role: "BUYER" });

    const response = await createOrder(
      orderRequest({
        eventId: event.id,
        seatIds: [],
        zones: [{ zoneId: zone.id, quantity: 4 }],
      }),
    );
    expect(response.status).toBe(409);
  });

  it("requires a verified email", async () => {
    const buyer = await createBuyer({ verified: false });
    const { event, zone } = await createApprovedEvent();
    actAs({ id: buyer.id, role: "BUYER" });

    const response = await createOrder(
      orderRequest({
        eventId: event.id,
        seatIds: [],
        zones: [{ zoneId: zone.id, quantity: 1 }],
      }),
    );
    expect(response.status).toBe(403);
  });

  it("caps unpaid orders per buyer at 3", async () => {
    const buyer = await createBuyer();
    const { event, zone } = await createApprovedEvent({ freeZoneCapacity: 100 });
    actAs({ id: buyer.id, role: "BUYER" });

    for (let i = 0; i < 3; i++) {
      const ok = await createOrder(
        orderRequest({
          eventId: event.id,
          seatIds: [],
          zones: [{ zoneId: zone.id, quantity: 1 }],
        }),
      );
      expect(ok.status).toBe(201);
    }
    const blocked = await createOrder(
      orderRequest({
        eventId: event.id,
        seatIds: [],
        zones: [{ zoneId: zone.id, quantity: 1 }],
      }),
    );
    expect(blocked.status).toBe(429);
  });
});

describe("availability is scoped per event, not per venue", () => {
  it("keeps a seat sold for one event available for another event at the same venue", async () => {
    const { event, venue, organizer, seats } = await createApprovedEvent({
      numbered: true,
    });
    const sameVenueEvent = await createEventAtVenue({
      venueId: venue.id,
      organizerId: organizer.id,
      title: "Segunda función",
    });

    const firstBuyer = await createBuyer();
    actAs({ id: firstBuyer.id, role: "BUYER" });
    const first = await createOrder(
      orderRequest({ eventId: event.id, seatIds: [seats[0].id], zones: [] }),
    );
    expect(first.status).toBe(201);

    // Same physical seat, different function: must still be on sale.
    const secondBuyer = await createBuyer();
    actAs({ id: secondBuyer.id, role: "BUYER" });
    const second = await createOrder(
      orderRequest({
        eventId: sameVenueEvent.id,
        seatIds: [seats[0].id],
        zones: [],
      }),
    );
    expect(second.status).toBe(201);
  });

  it("counts free-zone capacity separately for each event at the venue", async () => {
    const { event, venue, organizer, zone } = await createApprovedEvent({
      freeZoneCapacity: 2,
    });
    const sameVenueEvent = await createEventAtVenue({
      venueId: venue.id,
      organizerId: organizer.id,
      title: "Segunda función",
    });

    const firstBuyer = await createBuyer();
    actAs({ id: firstBuyer.id, role: "BUYER" });
    const soldOutFirst = await createOrder(
      orderRequest({ eventId: event.id, seatIds: [], zones: [{ zoneId: zone.id, quantity: 2 }] }),
    );
    expect(soldOutFirst.status).toBe(201);

    // The first event just sold its whole zone; the second one is untouched.
    const secondBuyer = await createBuyer();
    actAs({ id: secondBuyer.id, role: "BUYER" });
    const second = await createOrder(
      orderRequest({
        eventId: sameVenueEvent.id,
        seatIds: [],
        zones: [{ zoneId: zone.id, quantity: 2 }],
      }),
    );
    expect(second.status).toBe(201);

    // ...but the first one really is sold out.
    const third = await createOrder(
      orderRequest({ eventId: event.id, seatIds: [], zones: [{ zoneId: zone.id, quantity: 1 }] }),
    );
    expect(third.status).toBe(409);
  });

  it("still refuses to sell the same seat twice for the same event", async () => {
    const { event, seats } = await createApprovedEvent({ numbered: true });

    const firstBuyer = await createBuyer();
    actAs({ id: firstBuyer.id, role: "BUYER" });
    const first = await createOrder(
      orderRequest({ eventId: event.id, seatIds: [seats[0].id], zones: [] }),
    );
    expect(first.status).toBe(201);

    const secondBuyer = await createBuyer();
    actAs({ id: secondBuyer.id, role: "BUYER" });
    const second = await createOrder(
      orderRequest({ eventId: event.id, seatIds: [seats[0].id], zones: [] }),
    );
    expect(second.status).toBe(409);
  });

  it("frees a seat again once a cancelled order releases it", async () => {
    const { event, seats } = await createApprovedEvent({ numbered: true });

    const firstBuyer = await createBuyer();
    actAs({ id: firstBuyer.id, role: "BUYER" });
    expect(
      (
        await createOrder(
          orderRequest({ eventId: event.id, seatIds: [seats[0].id], zones: [] }),
        )
      ).status,
    ).toBe(201);

    await prisma.order.updateMany({
      where: { buyerId: firstBuyer.id },
      data: { status: "CANCELLED" },
    });

    const secondBuyer = await createBuyer();
    actAs({ id: secondBuyer.id, role: "BUYER" });
    const retry = await createOrder(
      orderRequest({ eventId: event.id, seatIds: [seats[0].id], zones: [] }),
    );
    expect(retry.status).toBe(201);
  });
});

describe("expireStaleOrders", () => {
  it("cancels overdue orders and puts their seats back on sale", async () => {
    const buyer = await createBuyer();
    const { event, seats } = await createApprovedEvent({ numbered: true });
    actAs({ id: buyer.id, role: "BUYER" });

    const created = await createOrder(
      orderRequest({ eventId: event.id, seatIds: [seats[0].id], zones: [] }),
    );
    expect(created.status).toBe(201);

    await prisma.order.updateMany({
      where: { buyerId: buyer.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await expireStaleOrders();

    const order = await prisma.order.findFirstOrThrow({
      where: { buyerId: buyer.id },
    });
    expect(order.status).toBe("CANCELLED");

    // The released seat is buyable again — that IS the release now.
    const nextBuyer = await createBuyer();
    actAs({ id: nextBuyer.id, role: "BUYER" });
    const retry = await createOrder(
      orderRequest({ eventId: event.id, seatIds: [seats[0].id], zones: [] }),
    );
    expect(retry.status).toBe(201);
  });
});
