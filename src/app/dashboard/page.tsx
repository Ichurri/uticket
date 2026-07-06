import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { formatCurrency, formatDate } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Mi panel",
};

export default async function DashboardPage() {
  const session = await auth();
  const organizerId = session!.user.id;
  await expireStaleOrders();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    venueCount,
    pendingReviewCount,
    activeEventCount,
    pendingOrders,
    revenueAggregate,
    ticketsSold,
    approvedEvents,
  ] = await Promise.all([
    prisma.venue.count({ where: { organizerId } }),
    prisma.event.count({ where: { organizerId, status: "PENDING" } }),
    prisma.event.count({
      where: { organizerId, status: "APPROVED", date: { gte: startOfToday } },
    }),
    prisma.order.count({
      where: { status: "PENDING_PAYMENT", event: { organizerId } },
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

  const stats = [
    {
      label: "Ingresos confirmados",
      value: formatCurrency(Number(revenueAggregate._sum.totalAmount ?? 0)),
    },
    { label: "Boletos vendidos", value: String(ticketsSold) },
    { label: "Eventos activos", value: String(activeEventCount) },
    { label: "Pagos por confirmar", value: String(pendingOrders) },
    { label: "En revisión", value: String(pendingReviewCount) },
    { label: "Venues", value: String(venueCount) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Hola, {session?.user?.name ?? "organizador"} 👋
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="truncate text-2xl font-bold" title={stat.value}>
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
                            className="h-full rounded-full bg-primary transition-all"
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
