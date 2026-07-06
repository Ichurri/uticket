import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EVENT_STATUS_LABELS } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EventActions } from "@/components/dashboard/EventActions";

export const metadata: Metadata = {
  title: "Mis eventos",
};

export default async function DashboardEventsPage() {
  const session = await auth();

  const events = await prisma.event.findMany({
    where: { organizerId: session!.user.id },
    include: { venue: { select: { name: true, city: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis eventos</h1>
        <Link href="/dashboard/events/new" className={buttonVariants({ size: "sm" })}>
          + Nuevo evento
        </Link>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="text-4xl">🎤</span>
            <p className="font-medium">Todavía no tenés eventos</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Creá tu primer evento, subí el QR de pago y envialo a revisión
              para que aparezca en el catálogo.
            </p>
            <Link href="/dashboard/events/new" className={buttonVariants({ size: "sm" })}>
              Crear mi primer evento
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((event) => {
            const statusInfo = EVENT_STATUS_LABELS[event.status];
            const editable =
              event.status === "DRAFT" || event.status === "PENDING";
            return (
              <Card key={event.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{event.title}</h2>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(event.date)} · {event.time} hrs ·{" "}
                      {event.venue.name} ({event.venue.city}) · Desde{" "}
                      {formatCurrency(Number(event.price))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {event.status === "APPROVED" && (
                      <Link
                        href={`/eventos/${event.id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Ver pública
                      </Link>
                    )}
                    {editable && (
                      <Link
                        href={`/dashboard/events/${event.id}/edit`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Editar
                      </Link>
                    )}
                    <EventActions eventId={event.id} status={event.status} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
