import { prisma } from "@/lib/prisma";
import { releaseExpiredHolds, releaseOrderHolds } from "@/lib/seats";

export const ORDER_EXPIRY_MINUTES = 15;

/**
 * Lazy expiration, run before reading or writing orders (a Vercel Cron does
 * the same every 5 min so abandoned holds are freed with nobody browsing).
 *
 * Cancelling the order is no longer the whole release. Availability now lives
 * on `EventTable` / `EventSeat` rows, so those have to be handed back too —
 * that is what `releaseOrderHolds` is for. Free-capacity zones still release
 * themselves, since they are counted from live orders.
 */
export async function expireStaleOrders() {
  const overdue = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", expiresAt: { lt: new Date() } },
    select: { id: true },
  });

  if (overdue.length > 0) {
    const ids = overdue.map((order) => order.id);
    await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: { status: "CANCELLED" },
    });
    await releaseOrderHolds(ids);
  }

  // Belt and braces: any hold whose clock ran out without an order behind it
  // (a crashed checkout, a manual DB edit) goes back on sale as well.
  await releaseExpiredHolds();

  return overdue.length;
}
