import type { Prisma } from "@/generated/prisma/client";
import { getInventoryByEvent } from "@/lib/seats";
import type { EventCardData } from "@/components/events/EventCard";

/** Shared shape for the home/catalog listings: enough of each zone to price
 * the event and compute how much of its inventory is left. */
export const eventCardInclude = {
  venue: {
    select: {
      name: true,
      city: true,
      zones: {
        select: {
          id: true,
          capacity: true,
          rows: true,
          priceMultiplier: true,
          seats: { select: { id: true } },
        },
      },
    },
  },
} satisfies Prisma.EventInclude;

type EventForCards = Prisma.EventGetPayload<{ include: typeof eventCardInclude }>;

const LOW_STOCK_RATIO = 0.1;

export async function toEventCards(
  events: EventForCards[],
): Promise<EventCardData[]> {
  // Per event, never per venue: two events in the same theatre each sell
  // their own copy of the seat map (see src/lib/seats.ts).
  const inventoryByEvent = await getInventoryByEvent(
    events.map((event) => event.id),
  );

  return events.map((event) => {
    const multipliers = event.venue.zones.map((zone) =>
      Number(zone.priceMultiplier),
    );
    const inventory = inventoryByEvent.get(event.id);

    let capacity = 0;
    let available = 0;
    for (const zone of event.venue.zones) {
      capacity += zone.capacity;
      available +=
        zone.rows === null
          ? Math.max(
              0,
              zone.capacity - (inventory?.freeZoneTaken.get(zone.id) ?? 0),
            )
          : zone.seats.filter((seat) => !inventory?.seatHolds.has(seat.id))
              .length;
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
      priceFrom:
        Number(event.price) * (multipliers.length ? Math.min(...multipliers) : 1),
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
