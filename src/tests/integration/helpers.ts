import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { eventDate } from "@/lib/utils";

export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Ticket", "OrderItem", "Order", "EventSeat", "EventTable", "EventZone", "Seat", "Table", "Zone", "Floor", "Event", "Venue", "VerificationToken", "Session", "Account", "PlatformSettings", "User" CASCADE',
  );
}

export function futureDateString(daysAhead = 30) {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

export async function createBuyer({ verified = true } = {}) {
  return prisma.user.create({
    data: {
      email: `buyer-${randomUUID()}@test.local`,
      name: "Comprador Test",
      role: "BUYER",
      emailVerified: verified ? new Date() : null,
    },
  });
}

/** Base price used by every helper-built event zone. */
export const TEST_ZONE_PRICE = 100;

export async function createApprovedEvent({
  freeZoneCapacity = 10,
  numbered = false,
}: { freeZoneCapacity?: number; numbered?: boolean } = {}) {
  const organizer = await prisma.user.create({
    data: {
      email: `organizer-${randomUUID()}@test.local`,
      name: "Organizador Test",
      role: "ORGANIZER",
      emailVerified: new Date(),
    },
  });
  const venue = await prisma.venue.create({
    data: {
      name: "Venue Test",
      address: "Calle Falsa 123",
      city: "La Paz",
      ownerId: organizer.id,
      // Every venue always has at least a ground floor
      floors: { create: { name: "Planta baja", order: 0 } },
    },
    include: { floors: true },
  });
  const floor = venue.floors[0];

  const zone = await prisma.zone.create({
    data: {
      name: "General",
      type: numbered ? "SEATED" : "GENERAL",
      capacity: numbered ? null : freeZoneCapacity,
      floorId: floor.id,
    },
  });
  const seats = numbered
    ? await prisma.seat.createManyAndReturn({
        data: [
          { row: "A", number: 1, zoneId: zone.id },
          { row: "A", number: 2, zoneId: zone.id },
          { row: "B", number: 1, zoneId: zone.id },
          { row: "B", number: 2, zoneId: zone.id },
        ],
      })
    : [];
  const event = await createEventAtVenue({
    venueId: venue.id,
    organizerId: organizer.id,
  });
  const eventZone = await putZoneOnSale(event.id, zone.id);
  return { organizer, venue, floor, zone, eventZone, seats, event };
}

/** Puts one physical zone on sale for one event, tables included. */
export async function putZoneOnSale(
  eventId: string,
  zoneId: string,
  price = TEST_ZONE_PRICE,
  extra: { tableSaleMode?: "WHOLE_TABLE" | "PER_SEAT"; seatPrice?: number } = {},
) {
  const zone = await prisma.zone.findUniqueOrThrow({
    where: { id: zoneId },
    select: { type: true, capacity: true, tables: { select: { id: true } } },
  });
  const eventZone = await prisma.eventZone.create({
    data: {
      eventId,
      zoneId,
      price,
      capacityForSale: zone.type === "GENERAL" ? zone.capacity : null,
      tableSaleMode: extra.tableSaleMode ?? "WHOLE_TABLE",
      seatPrice: extra.seatPrice ?? null,
    },
  });
  if (zone.tables.length > 0) {
    await prisma.eventTable.createMany({
      data: zone.tables.map((table) => ({
        eventZoneId: eventZone.id,
        tableId: table.id,
      })),
    });
  }
  return eventZone;
}

/** A second (third, ...) event in an existing venue — the case that used to
 * break: every event held there sells its own copy of the seat map. */
export function createEventAtVenue({
  venueId,
  organizerId,
  title = "Evento Test",
}: {
  venueId: string;
  organizerId: string;
  title?: string;
}) {
  return prisma.event.create({
    data: {
      title,
      description: "Descripción de prueba",
      category: "Música",
      date: eventDate(futureDateString()),
      time: "20:00",
      status: "APPROVED",
      paymentQrImage: "/uploads/qr-test.png",
      venueId,
      organizerId,
    },
  });
}

export function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A TABLES zone with two tables: "M1" (4 seats) and "M2" (2 seats),
 * attached to an existing floor so a test can mix it with whatever that
 * venue already has. */
export async function createTableZone(floorId: string) {
  const zone = await prisma.zone.create({
    data: { name: "Mesas", type: "TABLES", floorId },
  });
  const tables = await prisma.table.createManyAndReturn({
    data: [
      { label: "M1", seats: 4, posX: 20, posY: 20, zoneId: zone.id },
      { label: "M2", seats: 2, posX: 100, posY: 20, zoneId: zone.id },
    ],
  });
  return { zone, tables };
}
