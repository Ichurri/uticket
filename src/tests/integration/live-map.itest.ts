import { beforeEach, describe, expect, it } from "vitest";
import { getEventLiveMap } from "@/lib/event-live-map";
import { prisma } from "@/lib/prisma";
import {
  cleanDatabase,
  createApprovedEvent,
  createBuyer,
  createTableZone,
  putZoneOnSale,
} from "./helpers";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";

/** One order holding one thing, at the status we want to look at. */
async function placeOrder({
  eventId,
  buyerId,
  status,
  item,
  total,
}: {
  eventId: string;
  buyerId: string;
  status: OrderStatus;
  item: Prisma.OrderItemUncheckedCreateWithoutOrderInput;
  total: number;
}) {
  return prisma.order.create({
    data: {
      buyerId,
      eventId,
      status,
      totalAmount: total,
      expiresAt: new Date(Date.now() + 900_000),
      items: { create: item },
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("getEventLiveMap", () => {
  it("opens with everything free", async () => {
    const { event, floor } = await createApprovedEvent({ freeZoneCapacity: 40 });
    await createTableZone(floor.id).then(({ zone }) =>
      putZoneOnSale(event.id, zone.id),
    );

    const map = await getEventLiveMap(event.id);
    expect(map.floors).toHaveLength(1);

    const tables = map.floors[0].zones.flatMap((zone) => zone.tables);
    expect(tables).toHaveLength(2);
    expect(tables.every((table) => table.state === "AVAILABLE")).toBe(true);
    expect(map.totals.confirmed).toBe(0);
    expect(map.totals.pending).toBe(0);
    expect(map.totals.revenueConfirmed).toBe(0);
    // General zone (40) plus the two tables (4 + 2)
    expect(map.totals.capacity).toBe(46);
    expect(map.totals.available).toBe(46);
  });

  it("shows a table waiting for payment, and who has it", async () => {
    const { event, floor } = await createApprovedEvent();
    const buyer = await createBuyer();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 800);
    const eventTable = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id },
      include: { table: true },
    });
    await prisma.eventTable.update({
      where: { id: eventTable.id },
      data: { status: "HELD" },
    });
    await placeOrder({
      eventId: event.id,
      buyerId: buyer.id,
      status: "PENDING_PAYMENT",
      total: 800,
      item: {
        quantity: 1,
        unitPrice: 800,
        eventZoneId: eventZone.id,
        eventTableId: eventTable.id,
      },
    });

    const map = await getEventLiveMap(event.id);
    const live = map.floors[0].zones
      .flatMap((row) => row.tables)
      .find((row) => row.eventTableId === eventTable.id)!;

    expect(live.state).toBe("PENDING");
    expect(live.holders).toHaveLength(1);
    expect(live.holders[0].buyerName).toBe("Comprador Test");
    expect(live.holders[0].orderStatus).toBe("PENDING_PAYMENT");
    // A whole table is as many people as it seats
    expect(live.holders[0].people).toBe(eventTable.table.seats);
    expect(live.holders[0].amount).toBe(800);

    expect(map.totals.pending).toBe(eventTable.table.seats);
    expect(map.totals.revenuePending).toBe(800);
    expect(map.totals.revenueConfirmed).toBe(0);
  });

  it("turns green once the money is in", async () => {
    const { event, floor } = await createApprovedEvent();
    const buyer = await createBuyer();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 800);
    const eventTable = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id },
    });
    await prisma.eventTable.update({
      where: { id: eventTable.id },
      data: { status: "SOLD" },
    });
    await placeOrder({
      eventId: event.id,
      buyerId: buyer.id,
      status: "CONFIRMED",
      total: 800,
      item: {
        quantity: 1,
        unitPrice: 800,
        eventZoneId: eventZone.id,
        eventTableId: eventTable.id,
      },
    });

    const map = await getEventLiveMap(event.id);
    const live = map.floors[0].zones
      .flatMap((row) => row.tables)
      .find((row) => row.eventTableId === eventTable.id)!;

    expect(live.state).toBe("CONFIRMED");
    expect(map.totals.revenueConfirmed).toBe(800);
    expect(map.totals.revenuePending).toBe(0);
  });

  it("counts the spots of a shared table as separate buyers", async () => {
    const { event, floor } = await createApprovedEvent();
    const [first, second] = await Promise.all([createBuyer(), createBuyer()]);
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id, 800, {
      tableSaleMode: "PER_SEAT",
      seatPrice: 150,
    });
    // M1 seats 4: two spots each
    const eventTable = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, table: { label: "M1" } },
    });
    await prisma.eventTable.update({
      where: { id: eventTable.id },
      data: { status: "HELD", seatsSold: 4 },
    });
    for (const [buyer, status] of [
      [first, "CONFIRMED"],
      [second, "PAYMENT_SUBMITTED"],
    ] as const) {
      await placeOrder({
        eventId: event.id,
        buyerId: buyer.id,
        status,
        total: 300,
        item: {
          quantity: 1,
          seatsQuantity: 2,
          unitPrice: 150,
          eventZoneId: eventZone.id,
          eventTableId: eventTable.id,
        },
      });
    }

    const map = await getEventLiveMap(event.id);
    const live = map.floors[0].zones
      .flatMap((row) => row.tables)
      .find((row) => row.eventTableId === eventTable.id)!;

    expect(live.holders).toHaveLength(2);
    expect(live.holders.every((holder) => holder.people === 2)).toBe(true);
    expect(live.holders.every((holder) => holder.amount === 300)).toBe(true);
    // One paid, one did not: a paid spot makes the table read as sold
    expect(live.state).toBe("CONFIRMED");
    expect(live.seatsSold).toBe(4);
    expect(map.totals.confirmed).toBe(2);
    expect(map.totals.pending).toBe(2);
  });

  it("shows a blocked table as blocked, whatever the orders say", async () => {
    const { event, floor } = await createApprovedEvent();
    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);
    const eventTable = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id },
    });
    await prisma.eventTable.update({
      where: { id: eventTable.id },
      data: { status: "BLOCKED" },
    });

    const map = await getEventLiveMap(event.id);
    const live = map.floors[0].zones
      .flatMap((row) => row.tables)
      .find((row) => row.eventTableId === eventTable.id)!;
    expect(live.state).toBe("BLOCKED");

    // …and it stops being stock: a table nobody can buy is not "free"
    const tablesZone = map.floors[0].zones.find(
      (row) => row.eventZoneId === eventZone.id,
    )!;
    expect(tablesZone.capacity).toBe(2); // M2 only; M1 (4 seats) is blocked
    expect(tablesZone.available).toBe(2);
  });

  it("fills a general zone from its live orders", async () => {
    const { event, eventZone } = await createApprovedEvent({
      freeZoneCapacity: 50,
    });
    const [first, second] = await Promise.all([createBuyer(), createBuyer()]);

    await placeOrder({
      eventId: event.id,
      buyerId: first.id,
      status: "CONFIRMED",
      total: 400,
      item: { quantity: 4, unitPrice: 100, eventZoneId: eventZone.id },
    });
    await placeOrder({
      eventId: event.id,
      buyerId: second.id,
      status: "PENDING_PAYMENT",
      total: 300,
      item: { quantity: 3, unitPrice: 100, eventZoneId: eventZone.id },
    });

    const map = await getEventLiveMap(event.id);
    const zone = map.floors[0].zones.find(
      (row) => row.eventZoneId === eventZone.id,
    )!;

    expect(zone.confirmed).toBe(4);
    expect(zone.pending).toBe(3);
    expect(zone.available).toBe(43);
    expect(zone.revenueConfirmed).toBe(400);
    expect(zone.revenuePending).toBe(300);
    expect(zone.holders).toHaveLength(2);
  });

  it("ignores cancelled orders", async () => {
    const { event, eventZone } = await createApprovedEvent({
      freeZoneCapacity: 20,
    });
    const buyer = await createBuyer();
    await placeOrder({
      eventId: event.id,
      buyerId: buyer.id,
      status: "CANCELLED",
      total: 500,
      item: { quantity: 5, unitPrice: 100, eventZoneId: eventZone.id },
    });

    const map = await getEventLiveMap(event.id);
    expect(map.totals.confirmed).toBe(0);
    expect(map.totals.pending).toBe(0);
    expect(map.totals.available).toBe(20);
  });

  it("still draws a zone that is off sale, but does not count it as stock", async () => {
    const { event, eventZone } = await createApprovedEvent({
      freeZoneCapacity: 30,
    });
    await prisma.eventZone.update({
      where: { id: eventZone.id },
      data: { isEnabled: false },
    });

    const map = await getEventLiveMap(event.id);
    const zone = map.floors[0].zones.find(
      (row) => row.eventZoneId === eventZone.id,
    )!;
    expect(zone.isEnabled).toBe(false);
    expect(zone.capacity).toBe(30);
    expect(map.totals.capacity).toBe(0);
  });

  it("marks the seat someone took in a numbered zone", async () => {
    const { event, eventZone, seats } = await createApprovedEvent({
      numbered: true,
    });
    const buyer = await createBuyer();
    const eventSeat = await prisma.eventSeat.create({
      data: { eventZoneId: eventZone.id, seatId: seats[0].id, status: "SOLD" },
    });
    await placeOrder({
      eventId: event.id,
      buyerId: buyer.id,
      status: "CONFIRMED",
      total: 100,
      item: {
        quantity: 1,
        unitPrice: 100,
        eventZoneId: eventZone.id,
        eventSeatId: eventSeat.id,
      },
    });

    const map = await getEventLiveMap(event.id);
    const zone = map.floors[0].zones.find(
      (row) => row.eventZoneId === eventZone.id,
    )!;
    const taken = zone.seats.find((seat) => seat.seatId === seats[0].id)!;

    expect(taken.state).toBe("CONFIRMED");
    expect(taken.holder?.buyerName).toBe("Comprador Test");
    expect(zone.seats.filter((seat) => seat.state === "AVAILABLE")).toHaveLength(3);
    expect(zone.confirmed).toBe(1);
  });
});
