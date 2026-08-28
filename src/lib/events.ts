import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthedSession } from "@/lib/api-auth";
import { getInventoryByEvent, isTaken } from "@/lib/seats";
import type { EventCardData } from "@/components/events/EventCard";

/** Shared shape for the home/catalog listings: enough of the commercial layer
 * to price the event and see how much of it is left. */
export const eventCardInclude = {
  venue: { select: { name: true, city: true } },
  eventZones: {
    where: { isEnabled: true },
    select: {
      id: true,
      price: true,
      capacityForSale: true,
      zone: {
        select: {
          id: true,
          type: true,
          capacity: true,
          tables: { select: { id: true, seats: true } },
          seats: { select: { id: true } },
        },
      },
      eventTables: { select: { id: true, price: true, tableId: true } },
    },
  },
} satisfies Prisma.EventInclude;

type EventForCards = Prisma.EventGetPayload<{ include: typeof eventCardInclude }>;

const LOW_STOCK_RATIO = 0.1;

export async function toEventCards(
  events: EventForCards[],
): Promise<EventCardData[]> {
  const inventoryByEvent = await getInventoryByEvent(
    events.map((event) => event.id),
  );

  return events.map((event) => {
    const inventory = inventoryByEvent.get(event.id);

    const prices: number[] = [];
    let capacity = 0;
    let available = 0;

    for (const eventZone of event.eventZones) {
      const zone = eventZone.zone;
      const zonePrice = Number(eventZone.price);

      if (zone.type === "TABLES") {
        // A table zone prices per table, so its cheapest table is what it
        // contributes to the "desde" figure.
        const tableSeats = new Map(
          zone.tables.map((table) => [table.id, table.seats]),
        );
        for (const eventTable of eventZone.eventTables) {
          prices.push(
            eventTable.price !== null ? Number(eventTable.price) : zonePrice,
          );
          const seats = tableSeats.get(eventTable.tableId) ?? 0;
          capacity += seats;
          if (!isTaken(inventory?.tableStatus.get(eventTable.id))) {
            available += seats;
          }
        }
        continue;
      }

      prices.push(zonePrice);

      if (zone.type === "SEATED") {
        capacity += zone.seats.length;
        available += zone.seats.filter(
          (seat) => !isTaken(inventory?.seatStatus.get(seat.id)),
        ).length;
        continue;
      }

      const forSale = eventZone.capacityForSale ?? zone.capacity ?? 0;
      capacity += forSale;
      available += Math.max(
        0,
        forSale - (inventory?.generalTaken.get(eventZone.id) ?? 0),
      );
    }

    return {
      id: event.id,
      title: event.title,
      category: event.category,
      date: event.date,
      time: event.time,
      coverImage: event.coverImage,
      venueName: event.venue.name,
      city: event.venue.city,
      priceFrom: prices.length > 0 ? Math.min(...prices) : 0,
      scarcity:
        capacity === 0
          ? undefined
          : available <= 0
            ? "soldout"
            : available / capacity < LOW_STOCK_RATIO
              ? "low"
              : undefined,
    };
  });
}

/** 404 for a missing event, 403 for someone else's — ADMIN passes through. */
export async function findOwnEvent(id: string, session: AuthedSession) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return {
      response: NextResponse.json(
        { error: "Evento no encontrado" },
        { status: 404 },
      ),
    };
  }
  if (event.organizerId !== session.user.id && session.user.role !== "ADMIN") {
    return {
      response: NextResponse.json(
        { error: "No tenés permisos sobre este evento" },
        { status: 403 },
      ),
    };
  }
  return { event };
}
