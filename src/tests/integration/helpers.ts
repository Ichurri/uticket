import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { eventDate } from "@/lib/utils";

export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Ticket", "OrderItem", "Order", "Seat", "Zone", "Event", "Venue", "VerificationToken", "Session", "Account", "PlatformSettings", "User" CASCADE',
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
      capacity: numbered ? 4 : freeZoneCapacity,
      seatMapType: numbered ? "NUMBERED" : "ZONE",
      organizerId: organizer.id,
    },
  });
  const zone = await prisma.zone.create({
    data: {
      name: "General",
      capacity: numbered ? 4 : freeZoneCapacity,
      priceMultiplier: 1,
      venueId: venue.id,
      ...(numbered ? { rows: 2, seatsPerRow: 2 } : {}),
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
  return { organizer, venue, zone, seats, event };
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
      price: 100,
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
