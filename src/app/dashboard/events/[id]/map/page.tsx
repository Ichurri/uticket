import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { getEventLiveMap } from "@/lib/event-live-map";
import { formatCurrency, formatDate } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { AutoRefresh } from "@/components/layout/AutoRefresh";
import { LiveMapView } from "@/components/dashboard/LiveMapView";

export const metadata: Metadata = {
  title: "Mapa en vivo",
};

export default async function EventLiveMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  // Abandoned holds must not show as taken on a map called "live"
  await expireStaleOrders();

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      date: true,
      organizerId: true,
      venueId: true,
      venue: { select: { name: true } },
    },
  });
  if (
    !event ||
    (event.organizerId !== session!.user.id && session!.user.role !== "ADMIN")
  ) {
    notFound();
  }

  const map = await getEventLiveMap(id);
  const { totals } = map;
  const occupancy =
    totals.capacity > 0
      ? Math.round(((totals.confirmed + totals.pending) / totals.capacity) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={20000} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mapa en vivo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.title} · {event.venue.name} · {formatDate(event.date)}. Se
            actualiza solo cada 20 segundos.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/events/${event.id}/pricing`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Precios
          </Link>
          <Link
            href={`/dashboard/events/${event.id}/buyers`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Compradores
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ocupación" value={`${occupancy}%`} />
        <StatCard
          label="Vendidos"
          value={`${totals.confirmed} de ${totals.capacity}`}
        />
        <StatCard label="Por pagar" value={String(totals.pending)} />
        <StatCard
          label="Cobrado"
          value={formatCurrency(totals.revenueConfirmed)}
        />
      </div>

      <LiveMapView map={map} />
    </div>
  );
}
