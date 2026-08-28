import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/Button";
import { prisma } from "@/lib/prisma";
import {
  VenueForm,
  type VenueFormInitial,
} from "@/components/dashboard/VenueForm";

export const metadata: Metadata = {
  title: "Editar venue",
};

export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const venue = await prisma.venue.findUnique({
    where: { id },
    include: {
      floors: {
        orderBy: { order: "asc" },
        include: {
          zones: {
            orderBy: { order: "asc" },
            include: {
              tables: { select: { seats: true } },
              _count: { select: { seats: true } },
              seats: { select: { row: true }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (
    !venue ||
    (venue.ownerId !== session!.user.id && session!.user.role !== "ADMIN")
  ) {
    notFound();
  }

  // The layout freezes once anything from this venue has been sold
  const [soldItems, soldTickets] = await Promise.all([
    prisma.orderItem.count({
      where: { eventZone: { zone: { floor: { venueId: id } } } },
    }),
    prisma.ticket.count({
      where: { eventZone: { zone: { floor: { venueId: id } } } },
    }),
  ]);

  const initial: VenueFormInitial = {
    id: venue.id,
    name: venue.name,
    description: venue.description,
    address: venue.address,
    city: venue.city,
    googleMapsUrl: venue.googleMapsUrl,
    latitude: venue.latitude,
    longitude: venue.longitude,
    isPublic: venue.isPublic,
    locked: soldItems + soldTickets > 0,
    floors: venue.floors.map((floor) => ({
      name: floor.name,
      zones: floor.zones.map((zone) => {
        // The form edits generators, not individual rows: rebuild the inputs
        // that would produce the layout currently stored.
        const seatsPerTable = zone.tables[0]?.seats ?? 6;
        const rowCount = new Set(
          zone.seats.length > 0 ? [zone.seats[0].row] : [],
        ).size;
        return {
          name: zone.name,
          type: zone.type,
          color: zone.color,
          capacity: String(zone.capacity ?? 100),
          tableCount: String(zone.tables.length || 8),
          seatsPerTable: String(seatsPerTable),
          rows: String(rowCount || 5),
          seatsPerRow: String(
            rowCount > 0 ? Math.round(zone._count.seats / rowCount) : 10,
          ),
        };
      }),
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Editar venue</h1>
          <p className="mt-1 text-muted-foreground">
            Al guardar se regenera la distribución del lugar. Si el venue ya
            tiene ventas, esa parte queda bloqueada.
          </p>
        </div>
        <Link
          href={`/dashboard/venues/${venue.id}/editor`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Dibujar plano
        </Link>
      </div>
      <VenueForm initial={initial} />
    </div>
  );
}
