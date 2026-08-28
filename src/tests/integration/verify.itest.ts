import { randomUUID } from "node:crypto";
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
import { POST as confirmOrder } from "@/app/api/orders/[id]/confirm/route";
import { POST as verifyTicket } from "@/app/api/tickets/verify/route";
import { POST as eventStatus } from "@/app/api/events/[id]/status/route";
import { POST as undoCheckIn } from "@/app/api/tickets/undo/route";
import { prisma } from "@/lib/prisma";
import {
  cleanDatabase,
  createApprovedEvent,
  createBuyer,
  jsonRequest,
} from "./helpers";

function actAs(user: { id: string; role: string }) {
  authState.user = { ...authState.user, ...user };
}

/** Buys 2 zone tickets and confirms the order; returns organizer, event, tickets. */
async function confirmedTickets() {
  const buyer = await createBuyer();
  const { organizer, event, eventZone } = await createApprovedEvent();

  actAs({ id: buyer.id, role: "BUYER" });
  const created = await createOrder(
    jsonRequest("http://test.local/api/orders", {
      eventId: event.id,
      seatIds: [],
      zones: [{ eventZoneId: eventZone.id, quantity: 2 }],
    }),
  );
  expect(created.status).toBe(201);
  const order = await prisma.order.findFirstOrThrow({
    where: { buyerId: buyer.id },
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "PAYMENT_SUBMITTED", paymentProof: "proofs/test.jpg" },
  });

  actAs({ id: organizer.id, role: "ORGANIZER" });
  const confirmed = await confirmOrder(
    new Request(`http://test.local/api/orders/${order.id}/confirm`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: order.id }) },
  );
  expect(confirmed.status).toBe(200);

  const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
  return { organizer, event, tickets };
}

function verifyRequest(body: unknown) {
  return jsonRequest("http://test.local/api/tickets/verify", body);
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("POST /api/tickets/verify", () => {
  it("accepts a ticket exactly once under concurrent scans", async () => {
    const { organizer, tickets } = await confirmedTickets();
    actAs({ id: organizer.id, role: "ORGANIZER" });

    const responses = await Promise.all([
      verifyTicket(verifyRequest({ code: tickets[0].code })),
      verifyTicket(verifyRequest({ code: tickets[0].code })),
    ]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(results.filter((r) => r.result === "ACCEPTED")).toHaveLength(1);
    expect(results.filter((r) => r.result === "ALREADY_USED")).toHaveLength(1);
  });

  it("rejects another organizer's session", async () => {
    const { tickets } = await confirmedTickets();
    const intruder = await prisma.user.create({
      data: {
        email: `other-${randomUUID()}@test.local`,
        role: "ORGANIZER",
        emailVerified: new Date(),
      },
    });
    actAs({ id: intruder.id, role: "ORGANIZER" });

    const response = await verifyTicket(verifyRequest({ code: tickets[1].code }));
    expect(response.status).toBe(403);
  });

  it("accepts the event's door scan code without a session", async () => {
    const { event, tickets } = await confirmedTickets();
    const scanCode = randomUUID();
    await prisma.event.update({
      where: { id: event.id },
      data: { scanCode },
    });

    actAs({ id: "", role: "BUYER" }); // no session — scanCode is the credential
    const response = await verifyTicket(
      verifyRequest({ code: tickets[1].code, scanCode }),
    );
    const result = await response.json();
    expect(result.result).toBe("ACCEPTED");

    const wrongScan = await verifyTicket(
      verifyRequest({ code: tickets[1].code, scanCode: randomUUID() }),
    );
    expect(wrongScan.status).toBe(403);
  });

  it("refuses a ticket whose event was cancelled", async () => {
    const { organizer, event, tickets } = await confirmedTickets();

    actAs({ id: organizer.id, role: "ORGANIZER" });
    const cancelled = await eventStatus(
      jsonRequest(`http://test.local/api/events/${event.id}/status`, {
        action: "cancel",
      }),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(cancelled.status).toBe(200);

    const response = await verifyTicket(verifyRequest({ code: tickets[0].code }));
    const result = await response.json();
    expect(response.status).toBe(409);
    expect(result.result).toBe("CANCELLED");

    // ...and it was rejected, not consumed: the ticket is not marked USED.
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: tickets[0].id },
    });
    expect(ticket.usedAt).toBeNull();
  });
});

describe("POST /api/tickets/undo", () => {
  it("puts a mis-scanned ticket back on the door list", async () => {
    const { organizer, tickets } = await confirmedTickets();
    actAs({ id: organizer.id, role: "ORGANIZER" });

    expect(
      (await verifyTicket(verifyRequest({ code: tickets[0].code }))).status,
    ).toBe(200);

    const undone = await undoCheckIn(
      jsonRequest("http://test.local/api/tickets/undo", {
        code: tickets[0].code,
      }),
    );
    expect(undone.status).toBe(200);

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: tickets[0].id },
    });
    expect(ticket.status).toBe("VALID");
    expect(ticket.usedAt).toBeNull();

    // And the person can walk in again for real.
    const rescan = await verifyTicket(verifyRequest({ code: tickets[0].code }));
    expect((await rescan.json()).result).toBe("ACCEPTED");
  });

  it("refuses to undo a check-in older than the window", async () => {
    const { organizer, tickets } = await confirmedTickets();
    actAs({ id: organizer.id, role: "ORGANIZER" });
    await verifyTicket(verifyRequest({ code: tickets[0].code }));

    await prisma.ticket.update({
      where: { id: tickets[0].id },
      data: { usedAt: new Date(Date.now() - 10 * 60_000) },
    });

    const tooLate = await undoCheckIn(
      jsonRequest("http://test.local/api/tickets/undo", {
        code: tickets[0].code,
      }),
    );
    expect(tooLate.status).toBe(409);
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: tickets[0].id },
    });
    expect(ticket.status).toBe("USED");
  });

  it("refuses another organizer's ticket", async () => {
    const { organizer, tickets } = await confirmedTickets();
    actAs({ id: organizer.id, role: "ORGANIZER" });
    await verifyTicket(verifyRequest({ code: tickets[0].code }));

    const intruder = await prisma.user.create({
      data: {
        email: `other-${randomUUID()}@test.local`,
        role: "ORGANIZER",
        emailVerified: new Date(),
      },
    });
    actAs({ id: intruder.id, role: "ORGANIZER" });
    const response = await undoCheckIn(
      jsonRequest("http://test.local/api/tickets/undo", {
        code: tickets[0].code,
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("cancelling an event cascades", () => {
  it("kills live orders, voids issued tickets and frees the inventory", async () => {
    const { organizer, event, tickets } = await confirmedTickets();
    const paidOrderId = tickets[0].orderId;

    // A second buyer is mid-checkout when the event dies.
    const pendingBuyer = await createBuyer();
    actAs({ id: pendingBuyer.id, role: "BUYER" });
    const pending = await createOrder(
      jsonRequest("http://test.local/api/orders", {
        eventId: event.id,
        seatIds: [],
        zones: [{ eventZoneId: (await prisma.eventZone.findFirstOrThrow()).id, quantity: 1 }],
      }),
    );
    expect(pending.status).toBe(201);

    actAs({ id: organizer.id, role: "ORGANIZER" });
    const response = await eventStatus(
      jsonRequest(`http://test.local/api/events/${event.id}/status`, {
        action: "cancel",
      }),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(response.status).toBe(200);
    // Both buyers were emailed (dev transport reports ok).
    expect((await response.json()).notified).toBe(2);

    const orders = await prisma.order.findMany({ where: { eventId: event.id } });
    // The unpaid one is gone; the paid one keeps its CONFIRMED history.
    expect(
      orders.filter((order) => order.status === "CANCELLED"),
    ).toHaveLength(1);
    const paid = orders.find((order) => order.id === paidOrderId);
    expect(paid?.status).toBe("CONFIRMED");

    // No ticket is valid any more.
    const stillValid = await prisma.ticket.count({
      where: { eventId: event.id, status: "VALID" },
    });
    expect(stillValid).toBe(0);
  });

  it("cannot be cancelled twice", async () => {
    const { organizer, event } = await confirmedTickets();
    actAs({ id: organizer.id, role: "ORGANIZER" });

    const first = await eventStatus(
      jsonRequest(`http://test.local/api/events/${event.id}/status`, {
        action: "cancel",
      }),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(first.status).toBe(200);

    const second = await eventStatus(
      jsonRequest(`http://test.local/api/events/${event.id}/status`, {
        action: "cancel",
      }),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(second.status).toBe(409);
  });
});
