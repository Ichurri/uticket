import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadPricingZones, toPricingDto } from "@/lib/event-pricing";
import { formatDate } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TicketIcon } from "@/components/ui/icons";
import { PricingForm } from "@/components/dashboard/PricingForm";

export const metadata: Metadata = {
  title: "Precios del evento",
};

export default async function EventPricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const event = await prisma.event.findUnique({
    where: { id },
    include: { venue: { select: { id: true, name: true } } },
  });

  if (
    !event ||
    (event.organizerId !== session!.user.id && session!.user.role !== "ADMIN")
  ) {
    notFound();
  }

  const [zones, siblings] = await Promise.all([
    loadPricingZones(id),
    // Other events in the same venue: their setup is the one worth copying,
    // since they share the physical zones and tables.
    prisma.event.findMany({
      where: {
        venueId: event.venueId,
        organizerId: event.organizerId,
        id: { not: id },
      },
      select: { id: true, title: true, date: true },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Precios de {event.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.venue.name} · {formatDate(event.date)}. Cambiar un precio no
            toca los pedidos ya hechos: cada uno guarda lo que se pagó.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/events/${event.id}/map`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Mapa en vivo
          </Link>
          <Link
            href={`/dashboard/venues/${event.venueId}/editor`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Ver el plano
          </Link>
        </div>
      </div>

      {zones.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TicketIcon />}
            title="Este evento todavía no tiene zonas"
            description="Dibujá el plano del venue y volvé: cada zona aparece acá para ponerle precio."
            action={
              <Link
                href={`/dashboard/venues/${event.venueId}/editor`}
                className={buttonVariants({ size: "sm" })}
              >
                Dibujar el plano
              </Link>
            }
          />
        </Card>
      ) : (
        <PricingForm
          eventId={event.id}
          zones={zones.map(toPricingDto)}
          sources={siblings.map((sibling) => ({
            id: sibling.id,
            title: `${sibling.title} · ${formatDate(sibling.date)}`,
          }))}
        />
      )}
    </div>
  );
}
