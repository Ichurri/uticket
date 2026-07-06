import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EventForm } from "@/components/dashboard/EventForm";

export const metadata: Metadata = {
  title: "Nuevo evento",
};

export default async function NewEventPage() {
  const session = await auth();

  const venues = await prisma.venue.findMany({
    where: { organizerId: session!.user.id },
    select: { id: true, name: true, city: true },
    orderBy: { createdAt: "desc" },
  });

  if (venues.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="text-4xl">🏟️</span>
          <p className="font-medium">Primero necesitás un venue</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Todo evento ocurre en un venue. Creá uno con sus zonas y después
            volvé a crear tu evento.
          </p>
          <Link href="/dashboard/venues/new" className={buttonVariants({ size: "sm" })}>
            Crear venue
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Nuevo evento</h1>
        <p className="mt-1 text-muted-foreground">
          El evento se crea como borrador; cuando esté listo, envialo a
          revisión para publicarlo en el catálogo.
        </p>
      </div>
      <EventForm venues={venues} />
    </div>
  );
}
