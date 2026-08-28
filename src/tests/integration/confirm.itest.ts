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

beforeEach(async () => {
  await cleanDatabase();
});

describe("POST /api/orders/[id]/confirm", () => {
  it("issues tickets exactly once under concurrent confirms", async () => {
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
    const makeRequest = () =>
      confirmOrder(
        new Request(`http://test.local/api/orders/${order.id}/confirm`, {
          method: "POST",
        }),
        { params: Promise.resolve({ id: order.id }) },
      );

    const [first, second] = await Promise.all([makeRequest(), makeRequest()]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const ticketCount = await prisma.ticket.count({
      where: { orderId: order.id },
    });
    expect(ticketCount).toBe(2);

    const confirmed = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(confirmed.status).toBe("CONFIRMED");
  });
});
