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
  getEventInventory,
  isTaken,
  releaseOrderHolds,
} from "@/lib/seats";
import {
  cleanDatabase,
  createApprovedEvent,
  createBuyer,
  createEventAtVenue,
  createTableZone,
  putZoneOnSale,
  jsonRequest,
} from "./helpers";

function actAs(user: { id: string; role: string }) {
  authState.user = { ...authState.user, ...user };
}

function orderRequest(body: unknown) {
  return jsonRequest("http://test.local/api/orders", body);
}

function confirmContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("POST /api/orders — mesas", () => {
  it("charges the whole table as one line at the zone price", async () => {
    const buyer = await createBuyer();
    const { event, floor } = await createApprovedEvent();
    const { zone, tables } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 500);
    const eventTables = await prisma.eventTable.findMany({
      where: { eventZoneId: eventZone.id },
      include: { table: true },
    });
    const m1 = eventTables.find((row) => row.table.label === "M1")!;
    actAs({ id: buyer.id, role: "BUYER" });

    const response = await createOrder(
      orderRequest({ eventId: event.id, tables: [{ eventTableId: m1.id }] }),
    );
    expect(response.status).toBe(201);

    const { order } = await response.json();
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });

    expect(Number(stored.totalAmount)).toBe(500);
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0].eventTableId).toBe(m1.id);
    // The line unit IS the table, so quantity stays 1 and the money is right
    expect(stored.items[0].quantity).toBe(1);
    expect(stored.items[0].seatsQuantity).toBeNull();
    expect(stored.items[0].eventZoneId).toBe(eventZone.id);

    // Taking it flips the commercial row, never the physical table
    const held = await prisma.eventTable.findUniqueOrThrow({
      where: { id: m1.id },
    });
    expect(held.status).toBe("HELD");
    expect(held.heldUntil).not.toBeNull();
    const physical = await prisma.table.findUniqueOrThrow({
      where: { id: tables[0].id },
    });
    expect(Object.keys(physical)).not.toContain("status");
  });

  it("refuses to sell a table a live order of the same event already holds", async () => {
    const first = await createBuyer();
    const second = await createBuyer();
    const { event, floor } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 500);
    const m1 = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, table: { label: "M1" } },
    });

    actAs({ id: first.id, role: "BUYER" });
    expect(
      (
        await createOrder(
          orderRequest({ eventId: event.id, tables: [{ eventTableId: m1.id }] }),
        )
      ).status,
    ).toBe(201);

    actAs({ id: second.id, role: "BUYER" });
    const response = await createOrder(
      orderRequest({ eventId: event.id, tables: [{ eventTableId: m1.id }] }),
    );
    expect(response.status).toBe(409);
  });

  it("keeps the same physical table sellable for a different event", async () => {
    const buyer = await createBuyer();
    const { event, venue, floor, organizer } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const firstZone = await putZoneOnSale(event.id, zone.id, 500);
    const otherEvent = await createEventAtVenue({
      venueId: venue.id,
      organizerId: organizer.id,
      title: "Segunda función",
    });
    const secondZone = await putZoneOnSale(otherEvent.id, zone.id, 700);

    const m1First = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: firstZone.id, table: { label: "M1" } },
    });
    const m1Second = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: secondZone.id, table: { label: "M1" } },
    });

    actAs({ id: buyer.id, role: "BUYER" });
    expect(
      (
        await createOrder(
          orderRequest({
            eventId: event.id,
            tables: [{ eventTableId: m1First.id }],
          }),
        )
      ).status,
    ).toBe(201);

    // The physical table is shared; only Friday's commercial row is taken
    const response = await createOrder(
      orderRequest({
        eventId: otherEvent.id,
        tables: [{ eventTableId: m1Second.id }],
      }),
    );
    expect(response.status).toBe(201);

    const inventory = await getEventInventory(event.id);
    expect(isTaken(inventory.tableStatus.get(m1First.id))).toBe(true);
  });

  it("rejects a table that belongs to another event", async () => {
    const buyer = await createBuyer();
    const { event } = await createApprovedEvent();
    const other = await createApprovedEvent();
    const { zone } = await createTableZone(other.floor.id);
    const otherZone = await putZoneOnSale(other.event.id, zone.id, 500);
    const foreign = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: otherZone.id },
    });
    actAs({ id: buyer.id, role: "BUYER" });

    const response = await createOrder(
      orderRequest({
        eventId: event.id,
        tables: [{ eventTableId: foreign.id }],
      }),
    );
    expect(response.status).toBe(400);
  });

  it("refuses a zone the organizer has not enabled", async () => {
    const buyer = await createBuyer();
    const { event, floor } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 500);
    await prisma.eventZone.update({
      where: { id: eventZone.id },
      data: { isEnabled: false },
    });
    const m1 = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, table: { label: "M1" } },
    });
    actAs({ id: buyer.id, role: "BUYER" });

    const response = await createOrder(
      orderRequest({ eventId: event.id, tables: [{ eventTableId: m1.id }] }),
    );
    expect(response.status).toBe(409);
  });

  it("sells spots inside a table when the zone is PER_SEAT", async () => {
    const buyer = await createBuyer();
    const { event, floor } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 500, {
      tableSaleMode: "PER_SEAT",
      seatPrice: 90,
    });
    const m1 = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, table: { label: "M1" } },
    });
    actAs({ id: buyer.id, role: "BUYER" });

    const response = await createOrder(
      orderRequest({
        eventId: event.id,
        tables: [{ eventTableId: m1.id, seats: 3 }],
      }),
    );
    expect(response.status).toBe(201);
    const { order } = await response.json();

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(Number(stored.totalAmount)).toBe(270);

    const table = await prisma.eventTable.findUniqueOrThrow({
      where: { id: m1.id },
    });
    expect(table.seatsSold).toBe(3);
    // M1 seats 4, so one spot is still on sale
    expect(table.status).toBe("HELD");
  });

  it("refuses to oversell a PER_SEAT table", async () => {
    const buyer = await createBuyer();
    const { event, floor } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 500, {
      tableSaleMode: "PER_SEAT",
      seatPrice: 90,
    });
    const m2 = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, table: { label: "M2" } },
    });
    actAs({ id: buyer.id, role: "BUYER" });

    // M2 only seats 2
    const response = await createOrder(
      orderRequest({
        eventId: event.id,
        tables: [{ eventTableId: m2.id, seats: 3 }],
      }),
    );
    expect(response.status).toBe(409);
  });

  it("releases the table when the holding order is cancelled", async () => {
    const buyer = await createBuyer();
    const { event, floor } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 500);
    const m1 = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, table: { label: "M1" } },
    });
    actAs({ id: buyer.id, role: "BUYER" });

    const created = await createOrder(
      orderRequest({ eventId: event.id, tables: [{ eventTableId: m1.id }] }),
    );
    const { order } = await created.json();

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
    // Stored status means someone has to put it back — that is this call
    await releaseOrderHolds([order.id]);

    const released = await prisma.eventTable.findUniqueOrThrow({
      where: { id: m1.id },
    });
    expect(released.status).toBe("AVAILABLE");

    const second = await createOrder(
      orderRequest({ eventId: event.id, tables: [{ eventTableId: m1.id }] }),
    );
    expect(second.status).toBe(201);
  });
});

describe("POST /api/orders/[id]/confirm — mesas", () => {
  it("issues one ticket per seat of a whole table and snapshots it", async () => {
    const buyer = await createBuyer();
    const { event, floor, organizer } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 500);
    const m1 = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, table: { label: "M1" } },
    });
    actAs({ id: buyer.id, role: "BUYER" });

    const created = await createOrder(
      orderRequest({ eventId: event.id, tables: [{ eventTableId: m1.id }] }),
    );
    const { order } = await created.json();

    actAs({ id: organizer.id, role: "ORGANIZER" });
    const response = await confirmOrder(
      new Request(`http://test.local/api/orders/${order.id}/confirm`, {
        method: "POST",
      }),
      confirmContext(order.id),
    );
    expect(response.status).toBe(200);
    // M1 seats 4
    expect((await response.json()).tickets).toBe(4);

    const tickets = await prisma.ticket.findMany({
      where: { orderId: order.id },
    });
    expect(tickets).toHaveLength(4);
    expect(new Set(tickets.map((ticket) => ticket.code)).size).toBe(4);
    // Each ticket froze its own wording, so renaming the zone can't break it
    expect(tickets.every((ticket) => ticket.tableLabel === "M1")).toBe(true);
    expect(tickets.every((ticket) => ticket.zoneName === "Mesas")).toBe(true);
    expect(tickets.every((ticket) => ticket.floorName === "Planta baja")).toBe(
      true,
    );
    expect(Number(tickets[0].priceAtPurchase)).toBe(500);

    const sold = await prisma.eventTable.findUniqueOrThrow({
      where: { id: m1.id },
    });
    expect(sold.status).toBe("SOLD");
    expect(sold.heldUntil).toBeNull();
  });

  it("issues one ticket per spot in PER_SEAT mode", async () => {
    const buyer = await createBuyer();
    const { event, floor, organizer } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 500, {
      tableSaleMode: "PER_SEAT",
      seatPrice: 90,
    });
    const m1 = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, table: { label: "M1" } },
    });
    actAs({ id: buyer.id, role: "BUYER" });

    const created = await createOrder(
      orderRequest({
        eventId: event.id,
        tables: [{ eventTableId: m1.id, seats: 2 }],
      }),
    );
    const { order } = await created.json();

    actAs({ id: organizer.id, role: "ORGANIZER" });
    const response = await confirmOrder(
      new Request(`http://test.local/api/orders/${order.id}/confirm`, {
        method: "POST",
      }),
      confirmContext(order.id),
    );
    expect((await response.json()).tickets).toBe(2);
  });

  it("counts a mixed order line by line", async () => {
    const buyer = await createBuyer();
    const { event, floor, organizer, eventZone } = await createApprovedEvent({
      freeZoneCapacity: 10,
    });
    const { zone } = await createTableZone(floor.id);
    const tableZone = await putZoneOnSale(event.id, zone.id, 500);
    const m2 = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: tableZone.id, table: { label: "M2" } },
    });
    actAs({ id: buyer.id, role: "BUYER" });

    const created = await createOrder(
      orderRequest({
        eventId: event.id,
        tables: [{ eventTableId: m2.id }],
        zones: [{ eventZoneId: eventZone.id, quantity: 3 }],
      }),
    );
    expect(created.status).toBe(201);
    const { order } = await created.json();

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    // M2 whole at 500, plus 3 general tickets at 100
    expect(Number(stored.totalAmount)).toBe(800);

    actAs({ id: organizer.id, role: "ORGANIZER" });
    const response = await confirmOrder(
      new Request(`http://test.local/api/orders/${order.id}/confirm`, {
        method: "POST",
      }),
      confirmContext(order.id),
    );
    // 2 seats at M2 + 3 general tickets
    expect((await response.json()).tickets).toBe(5);
  });
});
