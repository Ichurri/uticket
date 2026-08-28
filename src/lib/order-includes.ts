import type { Prisma } from "@/generated/prisma/client";

/**
 * The one include every order-item read uses. It resolves exactly what
 * `orderItemLabel` needs and nothing more, so the label helper and its
 * callers can never drift apart.
 */
export const orderItemInclude = {
  eventZone: { select: { zone: { select: { name: true } } } },
  eventTable: { select: { table: { select: { label: true, seats: true } } } },
  eventSeat: { select: { seat: { select: { row: true, number: true } } } },
} satisfies Prisma.OrderItemInclude;

/** Tickets answer from their own snapshot; no joins needed for the label. */
export const ticketSnapshotSelect = {
  zoneName: true,
  tableLabel: true,
  seatLabel: true,
} satisfies Prisma.TicketSelect;
