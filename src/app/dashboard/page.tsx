import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Mi panel",
};

export default async function DashboardPage() {
  const session = await auth();
  const organizerId = session!.user.id;

  const [venueCount, draftCount, pendingCount, approvedCount] =
    await Promise.all([
      prisma.venue.count({ where: { organizerId } }),
      prisma.event.count({ where: { organizerId, status: "DRAFT" } }),
      prisma.event.count({ where: { organizerId, status: "PENDING" } }),
      prisma.event.count({ where: { organizerId, status: "APPROVED" } }),
    ]);

  const stats = [
    { label: "Venues", value: venueCount },
    { label: "Borradores", value: draftCount },
    { label: "En revisión", value: pendingCount },
    { label: "Aprobados", value: approvedCount },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Hola, {session?.user?.name ?? "organizador"} 👋
          </h1>
          <p className="mt-1 text-muted-foreground">
            Gestioná tus eventos y venues desde acá.
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          💡 Las estadísticas de ventas, ingresos y ocupación llegan en la Fase
          5. Por ahora podés crear venues con sus zonas, crear eventos y
          enviarlos a revisión.
        </CardContent>
      </Card>
    </div>
  );
}
