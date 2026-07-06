import { prisma } from "@/lib/prisma";

export const ORDER_EXPIRY_MINUTES = 15;

/**
 * Lazy expiration: there is no cron, so callers run this before reading or
 * writing orders. Cancels overdue PENDING_PAYMENT orders and releases the
 * seats they were holding.
 */
export async function expireStaleOrders() {
  const stale = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", expiresAt: { lt: new Date() } },
    select: { id: true, items: { select: { seatId: true } } },
  });
  if (stale.length === 0) return;

  const orderIds = stale.map((order) => order.id);
  const seatIds = stale
    .flatMap((order) => order.items.map((item) => item.seatId))
    .filter((seatId): seatId is string => seatId !== null);

  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: orderIds }, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED" },
    }),
    prisma.seat.updateMany({
      where: { id: { in: seatIds }, status: "RESERVED" },
      data: { status: "AVAILABLE" },
    }),
  ]);
}
