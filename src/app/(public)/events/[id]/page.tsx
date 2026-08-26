import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { getEventInventory } from "@/lib/seats";
import { getPlatformSettings } from "@/lib/settings";
import { eventStartsAt, formatDate, salesAreClosed } from "@/lib/utils";
import { TicketIcon, CalendarIcon, MapPinIcon, PhoneIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { SeatMap } from "@/components/seats/SeatMap";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { absoluteUrl } from "@/lib/site";
import { SelectionSummary } from "@/components/seats/SelectionSummary";
import type { EventSeatMapDto, ZoneDto } from "@/types/seat-map";

type PageProps = { params: Promise<{ id: string }> };

async function getApprovedEvent(id: string) {
  return prisma.event.findUnique({
    where: { id, status: "APPROVED" },
    include: {
      organizer: { select: { name: true, phone: true } },
      venue: {
        include: {
          zones: {
            include: {
              seats: {
                select: { id: true, row: true, number: true },
                orderBy: [{ row: "asc" }, { number: "asc" }],
              },
            },
            orderBy: { priceMultiplier: "desc" },
          },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id, status: "APPROVED" },
    select: {
      title: true,
      description: true,
      date: true,
      time: true,
      venue: { select: { name: true, city: true } },
    },
  });
  if (!event) return { title: "Evento" };

  // What a shared link should say at a glance: what, when, where. The
  // og:image is the generated card in opengraph-image.tsx.
  const description = `${formatDate(event.date)} · ${event.time} hrs · ${event.venue.name}, ${event.venue.city}. ${event.description}`
    .replace(/\s+/g, " ")
    .slice(0, 200);

  return {
    title: event.title,
    description,
    openGraph: {
      type: "website",
      title: `${event.title} · Üticket`,
      description,
      url: `/events/${id}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${event.title} · Üticket`,
      description,
    },
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  await expireStaleOrders();
  const event = await getApprovedEvent(id);
  if (!event) notFound();

  const { orderCutoffHours } = await getPlatformSettings();
  const salesClosed = salesAreClosed(event, orderCutoffHours);

  const basePrice = Number(event.price);
  // What THIS event's live orders hold — the venue's seats are shared with
  // every other event held there, so occupancy is never read off the seat.
  const { seatHolds, freeZoneTaken } = await getEventInventory(event.id);

  const zones: ZoneDto[] = event.venue.zones.map((zone) => {
    const numbered = zone.rows !== null;
    const seats = numbered
      ? zone.seats.map((seat) => ({
          ...seat,
          status: seatHolds.get(seat.id) ?? ("AVAILABLE" as const),
        }))
      : [];
    const available = numbered
      ? seats.filter((seat) => seat.status === "AVAILABLE").length
      : Math.max(0, zone.capacity - (freeZoneTaken.get(zone.id) ?? 0));
    return {
      id: zone.id,
      name: zone.name,
      numbered,
      price: basePrice * Number(zone.priceMultiplier),
      capacity: zone.capacity,
      available,
      seats,
    };
  });

  const seatMap: EventSeatMapDto = {
    eventId: event.id,
    eventTitle: event.title,
    zones,
  };

  const cheapestZone = zones.reduce<ZoneDto | null>(
    (cheapest, zone) =>
      !cheapest || zone.price < cheapest.price ? zone : cheapest,
    null,
  );
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description,
    startDate: eventStartsAt(event).toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venue.address,
        addressLocality: event.venue.city,
        addressCountry: "BO",
      },
    },
    ...(event.coverImage ? { image: [absoluteUrl(event.coverImage)] } : {}),
    organizer: {
      "@type": "Organization",
      name: event.organizer.name ?? "Üticket",
    },
    ...(cheapestZone
      ? {
          offers: {
            "@type": "Offer",
            price: cheapestZone.price,
            priceCurrency: "BOB",
            availability: salesClosed
              ? "https://schema.org/SoldOut"
              : "https://schema.org/InStock",
            url: absoluteUrl(`/events/${event.id}`),
          },
        }
      : {}),
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <script
        type="application/ld+json"
        // Serialized from our own DB rows, not from user-controlled HTML.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/25 via-primary/10 to-accent/20">
            {event.coverImage ? (
              <>
                {/* Blurred cover of the same image fills the letterbox area */}
                <Image
                  src={event.coverImage}
                  alt=""
                  aria-hidden
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="scale-110 object-cover opacity-60 blur-lg"
                />
                <Image
                  src={event.coverImage}
                  alt={event.title}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-contain"
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <TicketIcon className="h-20 w-20 text-primary/40" />
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">{event.category}</Badge>
              <span className="text-sm text-muted-foreground">
                Organiza: {event.organizer.name ?? "Üticket"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-3xl font-bold">{event.title}</h1>
              <ShareEventButton
                title={event.title}
                summary={`${formatDate(event.date)} · ${event.time} hrs · ${event.venue.name}, ${event.venue.city}`}
              />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {salesClosed ? "Venta cerrada" : "Elegí tus boletos"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesClosed ? (
                <p className="text-sm text-muted-foreground">
                  Las ventas para este evento ya cerraron
                  {orderCutoffHours > 0 &&
                    ` (se cierran ${orderCutoffHours} h antes del inicio)`}
                  . Si ya tenés tu boleto, presentalo en la entrada.
                </p>
              ) : (
                <SeatMap seatMap={seatMap} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acerca del evento</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {event.description}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium">{formatDate(event.date)}</p>
                  <p className="text-muted-foreground">{event.time} hrs</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-muted-foreground">
                  <MapPinIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium">{event.venue.name}</p>
                  <p className="text-muted-foreground">
                    {event.venue.address}, {event.venue.city}
                  </p>
                </div>
              </div>
              {event.organizer.phone && (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-muted-foreground">
                    <PhoneIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-medium">Contacto del organizador</p>
                    <a
                      href={`https://wa.me/${event.organizer.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {event.organizer.phone}
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {!salesClosed && (
            <div className="lg:sticky lg:top-20">
              <SelectionSummary eventId={event.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
