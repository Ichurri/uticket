import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { piecesWithSales } from "@/lib/venues";
import { buttonVariants } from "@/components/ui/Button";
import { FloorPlanEditor } from "@/components/venue-editor/FloorPlanEditor";

export const metadata: Metadata = {
  title: "Plano del venue",
};

export default async function VenueEditorPage({
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
              tables: { orderBy: { label: "asc" } },
              seats: { orderBy: [{ row: "asc" }, { number: "asc" }] },
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

  // Which zones can no longer be deleted, so the editor says so up front
  // instead of letting the save fail.
  const zoneIds = venue.floors.flatMap((floor) =>
    floor.zones.map((zone) => zone.id),
  );
  const sold = await piecesWithSales({ zoneIds });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Plano de {venue.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dibujá las zonas y colocá las mesas donde están de verdad. Esto es
            solo la forma del lugar: los precios se ponen después, en cada
            evento.
          </p>
        </div>
        <Link
          href={`/dashboard/venues/${venue.id}/edit`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Datos del venue
        </Link>
      </div>

      <FloorPlanEditor
        venueId={venue.id}
        floors={venue.floors}
        soldZoneIds={[...sold.zones]}
      />
    </div>
  );
}
