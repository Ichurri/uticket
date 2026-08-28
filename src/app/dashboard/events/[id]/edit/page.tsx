import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/Button";
import {
  EventForm,
  type EventFormInitial,
} from "@/components/dashboard/EventForm";

export const metadata: Metadata = {
  title: "Editar evento",
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      eventZones: {
        select: { price: true },
        orderBy: { price: "asc" },
        take: 1,
      },
    },
  });

  if (
    !event ||
    (event.organizerId !== session!.user.id && session!.user.role !== "ADMIN")
  ) {
    notFound();
  }

  const venues = await prisma.venue.findMany({
    where: { ownerId: event.organizerId },
    select: { id: true, name: true, city: true },
    orderBy: { createdAt: "desc" },
  });

  const initial: EventFormInitial = {
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.category,
    date: event.date.toISOString().slice(0, 10),
    time: event.time,
    venueId: event.venueId,
    // The form keeps one "precio base" that seeds newly generated zones; the
    // real per-zone prices are edited in /dashboard/events/[id]/pricing.
    basePrice: String(event.eventZones[0]?.price ?? 0),
    coverImage: event.coverImage,
    paymentQrImage: event.paymentQrImage,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Editar evento</h1>
          <p className="mt-1 text-muted-foreground">
            Solo los eventos en borrador o en revisión pueden editarse.
          </p>
        </div>
        <Link
          href={`/dashboard/events/${event.id}/pricing`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Precios por zona
        </Link>
      </div>
      <EventForm venues={venues} initial={initial} />
    </div>
  );
}
