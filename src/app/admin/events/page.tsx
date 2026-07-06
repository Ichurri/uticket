import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EVENT_STATUS_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EventReviewActions } from "@/components/admin/EventReviewActions";

export const metadata: Metadata = {
  title: "Gestión de eventos",
};

export default async function AdminEventsPage() {
  const events = await prisma.event.findMany({
    include: {
      organizer: { select: { name: true, email: true } },
      venue: { select: { name: true, city: true } },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const pending = events.filter((event) => event.status === "PENDING");
  const rest = events.filter((event) => event.status !== "PENDING");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Gestión de eventos</h1>
        <p className="mt-1 text-muted-foreground">
          Aprobá o rechazá los eventos enviados por los organizadores.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Pendientes de aprobación ({pending.length})</h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No hay eventos esperando revisión.
            </CardContent>
          </Card>
        ) : (
          pending.map((event) => (
            <Card key={event.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="min-w-0">
                  <h3 className="font-semibold">{event.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.category} · {formatDate(event.date)} · {event.time}{" "}
                    hrs · {event.venue.name} ({event.venue.city}) · Desde{" "}
                    {formatCurrency(Number(event.price))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Organiza: {event.organizer.name ?? event.organizer.email}
                    {event.paymentQrImage ? " · QR de pago cargado ✓" : ""}
                  </p>
                </div>
                <EventReviewActions eventId={event.id} />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Todos los eventos ({rest.length})</h2>
        {rest.map((event) => {
          const statusInfo = EVENT_STATUS_LABELS[event.status];
          return (
            <Card key={event.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{event.title}</h3>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(event.date)} · {event.venue.name} (
                    {event.venue.city}) · Organiza:{" "}
                    {event.organizer.name ?? event.organizer.email} ·{" "}
                    {event._count.orders} pedido
                    {event._count.orders === 1 ? "" : "s"}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
