import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MapPinIcon } from "@/components/ui/icons";
import { EventForm } from "@/components/dashboard/EventForm";

export const metadata: Metadata = {
  title: "Nuevo evento",
};

export default async function NewEventPage() {
  const session = await auth();

  const venues = await prisma.venue.findMany({
    where: { ownerId: session!.user.id },
    select: { id: true, name: true, city: true },
    orderBy: { createdAt: "desc" },
  });

  if (venues.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<MapPinIcon />}
          title="Primero necesitás un venue"
          description="Todo evento ocurre en un venue. Creá uno con sus zonas y después volvé a crear tu evento."
          action={
            <Link
              href="/dashboard/venues/new"
              className={buttonVariants({ size: "sm" })}
            >
              Crear venue
            </Link>
          }
        />
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
