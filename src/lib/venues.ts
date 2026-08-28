import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AuthedSession } from "@/lib/api-auth";

/** 404 for a missing venue, 403 for someone else's — ADMIN passes through. */
export async function findOwnVenue(id: string, session: AuthedSession) {
  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) {
    return {
      response: NextResponse.json(
        { error: "Venue no encontrado" },
        { status: 404 },
      ),
    };
  }
  if (venue.ownerId !== session.user.id && session.user.role !== "ADMIN") {
    return {
      response: NextResponse.json(
        { error: "No tenés permisos sobre este venue" },
        { status: 403 },
      ),
    };
  }
  return { venue };
}

/**
 * Whether anything of this venue has been sold. Used by the wholesale replace
 * path (`PATCH /api/venues/[id]`), which cannot tell one zone from another and
 * so has to freeze the lot. The layout editor is finer grained — see
 * `piecesWithSales` — because moving a table that is already sold is harmless:
 * geometry carries no money, and every ticket keeps its own snapshot.
 */
export async function venueHasSales(venueId: string) {
  const [items, tickets] = await Promise.all([
    prisma.orderItem.count({
      where: { eventZone: { zone: { floor: { venueId } } } },
    }),
    prisma.ticket.count({
      where: { eventZone: { zone: { floor: { venueId } } } },
    }),
  ]);
  return items + tickets > 0;
}

/**
 * Of the physical rows about to be DELETED, which ones something was already
 * sold against. Those are the only ones the editor may not remove: an order
 * item or a ticket points at them, and dropping the row would orphan it.
 *
 * Cancelled orders count too. The row is still referenced, and the buyer's
 * history should keep saying which table they had.
 */
export async function piecesWithSales({
  zoneIds = [],
  tableIds = [],
  seatIds = [],
}: {
  zoneIds?: string[];
  tableIds?: string[];
  seatIds?: string[];
}) {
  const [zoneItems, zoneTickets, tableItems, tableTickets, seatItems, seatTickets] =
    await Promise.all([
      zoneIds.length
        ? prisma.orderItem.findMany({
            where: { eventZone: { zoneId: { in: zoneIds } } },
            select: { eventZone: { select: { zoneId: true } } },
            distinct: ["eventZoneId"],
          })
        : [],
      zoneIds.length
        ? prisma.ticket.findMany({
            where: { eventZone: { zoneId: { in: zoneIds } } },
            select: { eventZone: { select: { zoneId: true } } },
            distinct: ["eventZoneId"],
          })
        : [],
      tableIds.length
        ? prisma.orderItem.findMany({
            where: { eventTable: { tableId: { in: tableIds } } },
            select: { eventTable: { select: { tableId: true } } },
            distinct: ["eventTableId"],
          })
        : [],
      tableIds.length
        ? prisma.ticket.findMany({
            where: { eventTable: { tableId: { in: tableIds } } },
            select: { eventTable: { select: { tableId: true } } },
            distinct: ["eventTableId"],
          })
        : [],
      seatIds.length
        ? prisma.orderItem.findMany({
            where: { eventSeat: { seatId: { in: seatIds } } },
            select: { eventSeat: { select: { seatId: true } } },
            distinct: ["eventSeatId"],
          })
        : [],
      seatIds.length
        ? prisma.ticket.findMany({
            where: { eventSeat: { seatId: { in: seatIds } } },
            select: { eventSeat: { select: { seatId: true } } },
            distinct: ["eventSeatId"],
          })
        : [],
    ]);

  return {
    zones: new Set(
      [...zoneItems, ...zoneTickets]
        .map((row) => row.eventZone?.zoneId)
        .filter((id): id is string => Boolean(id)),
    ),
    tables: new Set(
      [...tableItems, ...tableTickets]
        .map((row) => row.eventTable?.tableId)
        .filter((id): id is string => Boolean(id)),
    ),
    seats: new Set(
      [...seatItems, ...seatTickets]
        .map((row) => row.eventSeat?.seatId)
        .filter((id): id is string => Boolean(id)),
    ),
  };
}
