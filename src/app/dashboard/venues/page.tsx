import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { DeleteButton } from "@/components/dashboard/DeleteButton";

export const metadata: Metadata = {
  title: "Mis venues",
};

const seatMapTypeLabels = {
  ZONE: "Por zonas",
  NUMBERED: "Asientos numerados",
  BOTH: "Mixto",
} as const;

export default async function VenuesPage() {
  const session = await auth();

  const venues = await prisma.venue.findMany({
    where: { organizerId: session!.user.id },
    include: {
      zones: { select: { id: true } },
      _count: { select: { events: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis venues</h1>
        <Link href="/dashboard/venues/new" className={buttonVariants({ size: "sm" })}>
          + Nuevo venue
        </Link>
      </div>

      {venues.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="text-4xl">🏟️</span>
            <p className="font-medium">Todavía no tenés venues</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Un venue es el lugar donde ocurren tus eventos: definí sus zonas,
              capacidades y precios una sola vez y reutilizalo.
            </p>
            <Link href="/dashboard/venues/new" className={buttonVariants({ size: "sm" })}>
              Crear mi primer venue
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {venues.map((venue) => (
            <Card key={venue.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{venue.name}</h2>
                    <Badge variant="primary">
                      {seatMapTypeLabels[venue.seatMapType]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {venue.address}, {venue.city} · {venue.capacity} personas ·{" "}
                    {venue.zones.length} zona{venue.zones.length === 1 ? "" : "s"} ·{" "}
                    {venue._count.events} evento{venue._count.events === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/venues/${venue.id}/edit`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Editar
                  </Link>
                  <DeleteButton
                    url={`/api/venues/${venue.id}`}
                    confirmMessage={`¿Eliminar el venue "${venue.name}"? Esta acción no se puede deshacer.`}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
