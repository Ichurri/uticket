import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
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
    include: { zones: true },
  });

  if (
    !venue ||
    (venue.organizerId !== session!.user.id && session!.user.role !== "ADMIN")
  ) {
    notFound();
  }

  const initial: VenueFormInitial = {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    city: venue.city,
    zones: venue.zones.map((zone) => ({
      name: zone.name,
      priceMultiplier: String(zone.priceMultiplier),
      numbered: zone.rows !== null,
      capacity: String(zone.capacity),
      rows: String(zone.rows ?? 5),
      seatsPerRow: String(zone.seatsPerRow ?? 10),
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Editar venue</h1>
        <p className="mt-1 text-muted-foreground">
          Al guardar se regeneran las zonas y asientos. Si el venue ya tiene
          ventas, la estructura queda bloqueada.
        </p>
      </div>
      <VenueForm initial={initial} />
    </div>
  );
}
