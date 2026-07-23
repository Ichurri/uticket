import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { EVENT_STATUS_LABELS } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EyeIcon, TicketIcon } from "@/components/ui/icons";
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
          <>
            <div className="flex flex-col gap-3 md:hidden">
              {pending.map((event) => (
                <Card key={event.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 truncate font-semibold">
                      {event.title}
                    </h3>
                    <Badge>{event.category}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {formatDate(event.date)} · {event.time} hrs
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {event.venue.name} ({event.venue.city})
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                        className: "gap-1.5",
                      })}
                    >
                      <EyeIcon className="h-4 w-4" /> Ver más
                    </Link>
                    <EventReviewActions eventId={event.id} />
                  </div>
                </Card>
              ))}
            </div>

            <Card className="hidden overflow-hidden p-0 md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="whitespace-nowrap px-5 py-3 font-medium">Nombre del evento</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Tipo de evento</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Fecha y hora</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Lugar</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 text-center font-medium">Ver más</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {pending.map((event) => (
                      <tr key={event.id} className="hover:bg-muted/40">
                        <td className="whitespace-nowrap px-5 py-3 font-semibold">
                          {event.title}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                          {event.category}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                          {formatDate(event.date)} · {event.time} hrs
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                          {event.venue.name} ({event.venue.city})
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-center">
                          <Link
                            href={`/admin/events/${event.id}`}
                            aria-label="Ver más"
                            title="Ver más"
                            className={buttonVariants({
                              variant: "ghost",
                              size: "sm",
                              className: "w-9 px-0",
                            })}
                          >
                            <EyeIcon className="h-4 w-4" />
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <EventReviewActions eventId={event.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Todos los eventos ({rest.length})</h2>
        {rest.length > 0 && (
          <>
            <div className="flex flex-col gap-3 md:hidden">
              {rest.map((event) => {
                const statusInfo = EVENT_STATUS_LABELS[event.status];
                return (
                  <Card key={event.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 truncate font-semibold">
                        {event.title}
                      </h3>
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {formatDate(event.date)}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {event.venue.name} ({event.venue.city})
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3">
                      <Link
                        href={`/dashboard/events/${event.id}/buyers`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                          className: "gap-1.5",
                        })}
                      >
                        <TicketIcon className="h-4 w-4" /> Ver estadísticas
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {event._count.orders} pedido
                        {event._count.orders === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card className="hidden overflow-hidden p-0 md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="whitespace-nowrap px-5 py-3 font-medium">Nombre del evento</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Estado</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Fecha</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Lugar</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 text-center font-medium">Ver estadísticas</th>
                      <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Pedidos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {rest.map((event) => {
                      const statusInfo = EVENT_STATUS_LABELS[event.status];
                      return (
                        <tr key={event.id} className="hover:bg-muted/40">
                          <td className="whitespace-nowrap px-5 py-3 font-semibold">
                            {event.title}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3">
                            <Badge variant={statusInfo.variant}>
                              {statusInfo.label}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                            {formatDate(event.date)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                            {event.venue.name} ({event.venue.city})
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-center">
                            <Link
                              href={`/dashboard/events/${event.id}/buyers`}
                              aria-label="Ver estadísticas"
                              title="Ver estadísticas"
                              className={buttonVariants({
                                variant: "ghost",
                                size: "sm",
                                className: "w-9 px-0",
                              })}
                            >
                              <TicketIcon className="h-4 w-4" />
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                            {event._count.orders} pedido
                            {event._count.orders === 1 ? "" : "s"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </section>
    </div>
  );
}
