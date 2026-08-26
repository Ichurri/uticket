import { prisma } from "@/lib/prisma";

export const ORDER_EXPIRY_MINUTES = 15;

/**
 * Lazy expiration: there is no cron, so callers run this before reading or
 * writing orders. Cancelling the overdue orders is all it takes to release
 * what they were holding — both seats and free-zone capacity are derived
 * from live orders (see src/lib/seats.ts), so there is no separate
 * inventory row to reset.
 */
export async function expireStaleOrders() {
  await prisma.order.updateMany({
    where: { status: "PENDING_PAYMENT", expiresAt: { lt: new Date() } },
    data: { status: "CANCELLED" },
  });
}
