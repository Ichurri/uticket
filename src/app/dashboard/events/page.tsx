import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sumVenueCapacity, venueCapacitySelect } from "@/lib/venue-zones";
import { cn, formatShortDate } from "@/lib/utils";
import { EVENT_STATUS_LABELS } from "@/lib/constants";
import type { Prisma } from "@/generated/prisma/client";
import type { EventStatus } from "@/generated/prisma/enums";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  EyeIcon,
  MapPinIcon,
  MicIcon,
  PencilIcon,
  SearchIcon,
  TagIcon,
  TicketIcon,
} from "@/components/ui/icons";
import { EventActions } from "@/components/dashboard/EventActions";

function EventQuickLinks({
  eventId,
  eventTitle,
  status,
  editable,
}: {
  eventId: string;
  eventTitle: string;
  status: EventStatus;
  editable: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {status === "APPROVED" && (
        <Link
          href={`/events/${eventId}`}
          aria-label={`Ver ${eventTitle} pública`}
          title="Ver pública"
          className={buttonVariants({
            variant: "ghost",
            size: "md",
            className: "w-9 px-0",
          })}
        >
          <EyeIcon className="h-4 w-4" />
        </Link>
      )}
      <Link
        href={`/dashboard/events/${eventId}/buyers`}
        aria-label={`Compradores de ${eventTitle}`}
        title="Compradores"
        className={buttonVariants({
          variant: "ghost",
          size: "md",
          className: "w-9 px-0",
        })}
      >
        <TicketIcon className="h-4 w-4" />
      </Link>
      {status !== "CANCELLED" && (
        <Link
          href={`/dashboard/events/${eventId}/map`}
          aria-label={`Mapa en vivo de ${eventTitle}`}
          title="Mapa en vivo"
          className={buttonVariants({
            variant: "ghost",
            size: "md",
            className: "w-9 px-0",
          })}
        >
          <MapPinIcon className="h-4 w-4" />
        </Link>
      )}
      {status !== "CANCELLED" && (
        <Link
          href={`/dashboard/events/${eventId}/pricing`}
          aria-label={`Precios de ${eventTitle}`}
          title="Precios"
          className={buttonVariants({
            variant: "ghost",
            size: "md",
            className: "w-9 px-0",
          })}
        >
          <TagIcon className="h-4 w-4" />
        </Link>
      )}
      {editable && (
        <Link
          href={`/dashboard/events/${eventId}/edit`}
          aria-label={`Editar ${eventTitle}`}
          title="Editar"
          className={buttonVariants({
            variant: "ghost",
            size: "md",
            className: "w-9 px-0",
          })}
        >
          <PencilIcon className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export const metadata: Metadata = {
  title: "Mis eventos",
};

const FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "publicados", label: "Publicados" },
  { value: "borradores", label: "Borradores" },
] as const;
type EventFilter = (typeof FILTERS)[number]["value"];

type PageProps = {
  searchParams: Promise<{ q?: string; estado?: string }>;
};

export default async function DashboardEventsPage({
  searchParams,
}: PageProps) {
  const session = await auth();
  const { q, estado } = await searchParams;
  const activeFilter: EventFilter = FILTERS.some((f) => f.value === estado)
    ? (estado as EventFilter)
    : "todos";

  const where: Prisma.EventWhereInput = {
    organizerId: session!.user.id,
    ...(q?.trim() ? { title: { contains: q.trim(), mode: "insensitive" } } : {}),
    ...(activeFilter === "publicados" ? { status: "APPROVED" } : {}),
    ...(activeFilter === "borradores" ? { status: "DRAFT" } : {}),
  };

  const events = await prisma.event.findMany({
    where,
    include: {
      venue: { select: { name: true, city: true, ...venueCapacitySelect } },
      _count: { select: { tickets: { where: { status: { not: "CANCELLED" } } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  function filterHref(filter: EventFilter) {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    if (filter !== "todos") params.set("estado", filter);
    const query = params.toString();
    return query ? `/dashboard/events?${query}` : "/dashboard/events";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
            Mis eventos
          </h1>
          <span className="h-[3px] w-10 bg-gradient-to-r from-gold to-transparent" />
        </div>
        <Link href="/dashboard/events/new" className={buttonVariants({ size: "sm" })}>
          + Crear evento
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action="/dashboard/events" className="w-full max-w-sm flex-1">
          {activeFilter !== "todos" && (
            <input type="hidden" name="estado" value={activeFilter} />
          )}
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar evento"
              className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3.5 text-sm text-card-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
          </div>
        </form>
        <div className="flex gap-2">
          {FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={filterHref(filter.value)}
              className={cn(
                "inline-flex h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
                filter.value === activeFilter
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {filter.label}
            </Link>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MicIcon />}
            title="Todavía no tenés eventos"
            description="Creá tu primer evento, subí el QR de pago y envialo a revisión para que aparezca en el catálogo."
            action={
              <Link
                href="/dashboard/events/new"
                className={buttonVariants({ size: "sm" })}
              >
                Crear mi primer evento
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:hidden">
            {events.map((event) => {
              const statusInfo = EVENT_STATUS_LABELS[event.status];
              const editable =
                event.status === "DRAFT" || event.status === "PENDING";
              const capacity = sumVenueCapacity(event.venue);
              const sold = event._count.tickets;
              const percent =
                capacity > 0
                  ? Math.min(100, Math.round((sold / capacity) * 100))
                  : 0;
              return (
                <Card key={event.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {event.coverImage ? (
                        <Image
                          src={event.coverImage}
                          alt=""
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <TicketIcon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatShortDate(event.date)}
                      </p>
                    </div>
                    <Badge variant={statusInfo.variant}>
                      {statusInfo.label}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-col gap-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      {sold}/{capacity} vendidos
                    </span>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3">
                    <EventQuickLinks
                      eventId={event.id}
                      eventTitle={event.title}
                      status={event.status}
                      editable={editable}
                    />
                    <EventActions eventId={event.id} status={event.status} />
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden p-0 md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Evento</th>
                  <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Fecha</th>
                  <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Vendidos</th>
                  <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Estado</th>
                  <th className="w-px whitespace-nowrap px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {events.map((event) => {
                  const statusInfo = EVENT_STATUS_LABELS[event.status];
                  const editable =
                    event.status === "DRAFT" || event.status === "PENDING";
                  const capacity = sumVenueCapacity(event.venue);
                  const sold = event._count.tickets;
                  const percent =
                    capacity > 0
                      ? Math.min(100, Math.round((sold / capacity) * 100))
                      : 0;
                  return (
                    <tr key={event.id} className="transition-colors hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {event.coverImage ? (
                              <Image
                                src={event.coverImage}
                                alt=""
                                width={44}
                                height={44}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-muted-foreground">
                                <TicketIcon className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <span className="min-w-0 truncate font-semibold">
                            {event.title}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {formatShortDate(event.date)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-xs text-muted-foreground">
                            {sold}/{capacity}
                          </span>
                          <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.label}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <div className="flex flex-nowrap items-center gap-2">
                          <EventQuickLinks
                            eventId={event.id}
                            eventTitle={event.title}
                            status={event.status}
                            editable={editable}
                          />
                          <EventActions eventId={event.id} status={event.status} />
                        </div>
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
    </div>
  );
}
