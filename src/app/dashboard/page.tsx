import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { cn, formatCurrency, formatDate, BOLIVIA_TZ } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { ReviewQueue } from "@/components/dashboard/ReviewQueue";
import { MiniBarChart } from "@/components/dashboard/MiniBarChart";

export const metadata: Metadata = {
  title: "Mi panel",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets confirmed-order revenue into the last 7 calendar days (Bolivia
 * time) for the sales chart. The last bucket (today) is labeled "HOY". */
function bucketLast7Days(orders: { createdAt: Date; totalAmount: number }[]) {
  const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOLIVIA_TZ,
  });
  const labelFormatter = new Intl.DateTimeFormat("es-BO", {
    weekday: "short",
    timeZone: BOLIVIA_TZ,
  });

  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() - (6 - i) * DAY_MS);
    return {
      key: dayKeyFormatter.format(date),
      label: i === 6 ? "HOY" : labelFormatter.format(date).replace(/\.$/, ""),
      value: 0,
    };
  });

  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const order of orders) {
    const bucket = byKey.get(dayKeyFormatter.format(order.createdAt));
    if (bucket) bucket.value += order.totalAmount;
  }
  return days.map(({ label, value }) => ({ label, value }));
}

export default async function DashboardPage() {
  const session = await auth();
  const organizerId = session!.user.id;
  await expireStaleOrders();

  const now = new Date();
  const startOfToday = new Date(now.getTime());
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * DAY_MS);
  const fourteenDaysAgo = new Date(startOfToday.getTime() - 13 * DAY_MS);
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000);

  const [
    venueCount,
    pendingReviewCount,
    activeEventCount,
    pendingOrders,
    revenueAggregate,
    ticketsSold,
    approvedEvents,
    reviewOrdersCount,
    reviewOrders,
    recentConfirmed,
    previousWeekRevenueAgg,
    ticketsSoldThisWeek,
    oldReviewCount,
  ] = await Promise.all([
    prisma.venue.count({ where: { organizerId } }),
    prisma.event.count({ where: { organizerId, status: "PENDING" } }),
    prisma.event.count({
      where: { organizerId, status: "APPROVED", date: { gte: startOfToday } },
    }),
    prisma.order.count({
      where: {
        status: { in: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED"] },
        event: { organizerId },
      },
    }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: "CONFIRMED", event: { organizerId } },
    }),
    prisma.ticket.count({
      where: { status: { not: "CANCELLED" }, event: { organizerId } },
    }),
    prisma.event.findMany({
      where: { organizerId, status: "APPROVED" },
      select: {
        id: true,
        title: true,
        date: true,
        venue: {
          select: {
            zones: {
              select: { id: true, name: true, capacity: true },
              orderBy: { priceMultiplier: "desc" },
            },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.order.count({
      where: { status: "PAYMENT_SUBMITTED", event: { organizerId } },
    }),
    prisma.order.findMany({
      where: { status: "PAYMENT_SUBMITTED", event: { organizerId } },
      include: {
        buyer: { select: { name: true, email: true } },
        event: { select: { title: true } },
        items: {
          include: {
            seat: { select: { row: true, number: true } },
            zone: { select: { name: true } },
          },
        },
      },
      orderBy: { paymentSubmittedAt: "asc" },
      take: 6,
    }),
    prisma.order.findMany({
      where: {
        status: "CONFIRMED",
        event: { organizerId },
        createdAt: { gte: sevenDaysAgo },
      },
      select: { createdAt: true, totalAmount: true },
    }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: {
        status: "CONFIRMED",
        event: { organizerId },
        createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
      },
    }),
    prisma.ticket.count({
      where: {
        status: { not: "CANCELLED" },
        event: { organizerId },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.order.count({
      where: {
        status: "PAYMENT_SUBMITTED",
        event: { organizerId },
        paymentSubmittedAt: { lte: thirtyMinAgo },
      },
    }),
  ]);

  const soldByEventZone = new Map<string, number>();
  if (approvedEvents.length > 0) {
    const grouped = await prisma.ticket.groupBy({
      by: ["eventId", "zoneId"],
      where: {
        eventId: { in: approvedEvents.map((event) => event.id) },
        status: { not: "CANCELLED" },
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      soldByEventZone.set(`${row.eventId}:${row.zoneId}`, row._count._all);
    }
  }

  const thisWeekRevenue = recentConfirmed.reduce(
    (sum, order) => sum + Number(order.totalAmount),
    0,
  );
  const lastWeekRevenue = Number(previousWeekRevenueAgg._sum.totalAmount ?? 0);
  const revenueChangePercent =
    lastWeekRevenue > 0
      ? Math.round(
          ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100,
        )
      : null;

  const nextEvent = approvedEvents.find(
    (event) => event.date.getTime() >= startOfToday.getTime(),
  );
  const daysUntilNext = nextEvent
    ? Math.round((nextEvent.date.getTime() - startOfToday.getTime()) / DAY_MS)
    : null;

  const stats: {
    label: string;
    value: string;
    sub?: { text: string; tone?: "success" | "warning" };
  }[] = [
    {
      label: "Ingresos confirmados",
      value: formatCurrency(Number(revenueAggregate._sum.totalAmount ?? 0)),
      sub:
        revenueChangePercent === null
          ? undefined
          : {
              text: `${revenueChangePercent >= 0 ? "▲" : "▼"} ${Math.abs(revenueChangePercent)}% vs. semana pasada`,
              tone: revenueChangePercent >= 0 ? "success" : undefined,
            },
    },
    {
      label: "Boletos vendidos",
      value: String(ticketsSold),
      sub:
        ticketsSoldThisWeek > 0
          ? { text: `▲ ${ticketsSoldThisWeek} esta semana`, tone: "success" }
          : undefined,
    },
    {
      label: "Eventos activos",
      value: String(activeEventCount),
      sub:
        daysUntilNext === null
          ? undefined
          : {
              text:
                daysUntilNext === 0
                  ? "Próximo: hoy"
                  : `Próximo: en ${daysUntilNext} día${daysUntilNext === 1 ? "" : "s"}`,
            },
    },
    {
      label: "Pagos por confirmar",
      value: String(pendingOrders),
      sub:
        oldReviewCount > 0
          ? { text: `${oldReviewCount} esperando hace +30 min`, tone: "warning" }
          : undefined,
    },
    { label: "Eventos en revisión", value: String(pendingReviewCount) },
    { label: "Venues", value: String(venueCount) },
  ];

  const dailyConfirmed = bucketLast7Days(
    recentConfirmed.map((order) => ({
      createdAt: order.createdAt,
      totalAmount: Number(order.totalAmount),
    })),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Hola, {session?.user?.name ?? "organizador"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Así van tus ventas y eventos.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/venues/new"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            + Nuevo venue
          </Link>
          <Link
            href="/dashboard/events/new"
            className={buttonVariants({ size: "sm" })}
          >
            + Nuevo evento
          </Link>
        </div>
      </div>

      <ReviewQueue
        orders={reviewOrders.map((order) => ({
          ...order,
          totalAmount: Number(order.totalAmount),
        }))}
        totalCount={reviewOrdersCount}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex flex-col gap-1 p-5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {stat.label}
              </span>
              <p
                className="truncate font-display text-2xl font-extrabold"
                title={stat.value}
              >
                {stat.value}
              </p>
              {stat.sub && (
                <span
                  className={cn(
                    "text-xs",
                    stat.sub.tone === "success"
                      ? "text-success"
                      : stat.sub.tone === "warning"
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                >
                  {stat.sub.text}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ventas · últimos 7 días</CardTitle>
        </CardHeader>
        <CardContent>
          <MiniBarChart data={dailyConfirmed} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Ocupación por zona</h2>
        {approvedEvents.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Cuando tengas eventos aprobados, acá vas a ver cuántos boletos
              vendiste en cada zona.
            </CardContent>
          </Card>
        ) : (
          approvedEvents.map((event) => {
            const totalCapacity = event.venue.zones.reduce(
              (sum, zone) => sum + zone.capacity,
              0,
            );
            const totalSold = event.venue.zones.reduce(
              (sum, zone) =>
                sum + (soldByEventZone.get(`${event.id}:${zone.id}`) ?? 0),
              0,
            );
            return (
              <Card key={event.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <CardTitle>{event.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(event.date)} · {totalSold}/{totalCapacity}{" "}
                      boletos
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {event.venue.zones.map((zone) => {
                    const sold =
                      soldByEventZone.get(`${event.id}:${zone.id}`) ?? 0;
                    const percent =
                      zone.capacity > 0
                        ? Math.round((sold / zone.capacity) * 100)
                        : 0;
                    const nearlySoldOut = percent >= 80;
                    return (
                      <div key={zone.id} className="flex flex-col gap-1">
                        <div className="flex justify-between text-sm">
                          <span>{zone.name}</span>
                          <span className="text-muted-foreground">
                            {sold}/{zone.capacity} ({percent}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={
                              nearlySoldOut
                                ? "h-full rounded-full bg-gradient-to-r from-primary to-gold-bright transition-all"
                                : "h-full rounded-full bg-primary transition-all"
                            }
                            style={{ width: `${Math.min(100, percent)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
