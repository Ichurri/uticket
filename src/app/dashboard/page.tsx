import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { cn, formatCurrency, formatWeekdayDate, BOLIVIA_TZ } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { ReviewQueue } from "@/components/dashboard/ReviewQueue";
import { MiniBarChart } from "@/components/dashboard/MiniBarChart";
import { ScanIcon } from "@/components/ui/icons";

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
    activeEventCount,
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
    prisma.event.count({
      where: { organizerId, status: "APPROVED", date: { gte: startOfToday } },
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

  const totalCapacity = approvedEvents.reduce(
    (sum, event) =>
      sum + event.venue.zones.reduce((s, zone) => s + zone.capacity, 0),
    0,
  );

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
      value: `${ticketsSold} / ${totalCapacity}`,
      sub:
        ticketsSoldThisWeek > 0
          ? { text: `▲ ${ticketsSoldThisWeek} esta semana`, tone: "success" }
          : undefined,
    },
    {
      label: "Por revisar",
      value: String(reviewOrdersCount),
      sub:
        oldReviewCount > 0
          ? { text: `${oldReviewCount} esperando hace +30 min`, tone: "warning" }
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
  ];

  const dailyConfirmed = bucketLast7Days(
    recentConfirmed.map((order) => ({
      createdAt: order.createdAt,
      totalAmount: Number(order.totalAmount),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
            Hola, {session?.user?.name ?? "organizador"}
          </h1>
          <span className="h-[3px] w-10 bg-gradient-to-r from-gold to-transparent" />
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/verify"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ScanIcon className="h-4 w-4" />
            Escanear entradas
          </Link>
          <Link
            href="/dashboard/events/new"
            className={buttonVariants({ size: "sm" })}
          >
            + Crear evento
          </Link>
        </div>
      </div>

      {reviewOrdersCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold-soft px-5 py-3.5">
          <p className="text-sm">
            <span className="font-bold text-gold">
              {reviewOrdersCount} comprobante
              {reviewOrdersCount === 1 ? "" : "s"} esperan tu revisión
            </span>{" "}
            <span className="text-muted-foreground">
              — los compradores no reciben sus boletos hasta que apruebes.
            </span>
          </p>
          <a
            href="#comprobantes-queue"
            className="shrink-0 text-sm font-semibold text-gold hover:underline"
          >
            Ir a la cola ↓
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div id="comprobantes-queue" className="min-w-0">
          <ReviewQueue
            orders={reviewOrders.map((order) => ({
              ...order,
              totalAmount: Number(order.totalAmount),
            }))}
            totalCount={reviewOrdersCount}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tus eventos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {approvedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Cuando tengas eventos aprobados, acá vas a ver su ocupación.
                </p>
              ) : (
                approvedEvents.slice(0, 5).map((event) => {
                  const capacity = event.venue.zones.reduce(
                    (sum, zone) => sum + zone.capacity,
                    0,
                  );
                  const sold = event.venue.zones.reduce(
                    (sum, zone) =>
                      sum +
                      (soldByEventZone.get(`${event.id}:${zone.id}`) ?? 0),
                    0,
                  );
                  const percent =
                    capacity > 0
                      ? Math.round((sold / capacity) * 100)
                      : 0;
                  const nearlySoldOut = percent >= 80;
                  return (
                    <div key={event.id} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">
                          {event.title}
                        </span>
                        <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                          {sold}/{capacity}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            nearlySoldOut
                              ? "bg-gradient-to-r from-primary to-gold-bright"
                              : "bg-primary",
                          )}
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatWeekdayDate(event.date)} ·{" "}
                        {percent > 0 ? `${percent}% vendido` : "recién publicado"}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas · últimos 7 días</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniBarChart data={dailyConfirmed} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
