import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { getPlatformSettings } from "@/lib/settings";
import { formatDate, salesAreClosed } from "@/lib/utils";
import { TicketIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { SeatMap } from "@/components/seats/SeatMap";
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
                select: { id: true, row: true, number: true, status: true },
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

/** Tickets already committed per free-capacity zone (pending or confirmed orders). */
async function getZoneSoldCounts(zoneIds: string[]) {
  if (zoneIds.length === 0) return new Map<string, number>();
  const grouped = await prisma.orderItem.groupBy({
    by: ["zoneId"],
    where: {
      zoneId: { in: zoneIds },
      seatId: null,
      order: {
        status: { in: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "CONFIRMED"] },
      },
    },
    _sum: { quantity: true },
  });
  return new Map(
    grouped.map((row) => [row.zoneId as string, row._sum.quantity ?? 0]),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id, status: "APPROVED" },
    select: { title: true },
  });
  return { title: event?.title ?? "Evento" };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  await expireStaleOrders();
  const event = await getApprovedEvent(id);
  if (!event) notFound();

  const { orderCutoffHours } = await getPlatformSettings();
  const salesClosed = salesAreClosed(event, orderCutoffHours);

  const basePrice = Number(event.price);
  const freeZoneIds = event.venue.zones
    .filter((zone) => zone.rows === null)
    .map((zone) => zone.id);
  const soldByZone = await getZoneSoldCounts(freeZoneIds);

  const zones: ZoneDto[] = event.venue.zones.map((zone) => {
    const numbered = zone.rows !== null;
    const available = numbered
      ? zone.seats.filter((seat) => seat.status === "AVAILABLE").length
      : Math.max(0, zone.capacity - (soldByZone.get(zone.id) ?? 0));
    return {
      id: zone.id,
      name: zone.name,
      numbered,
      price: basePrice * Number(zone.priceMultiplier),
      capacity: zone.capacity,
      available,
      seats: numbered ? zone.seats : [],
    };
  });

  const seatMap: EventSeatMapDto = {
    eventId: event.id,
    eventTitle: event.title,
    zones,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
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
            <h1 className="mt-2 text-3xl font-bold">{event.title}</h1>
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
                <span>📅</span>
                <div>
                  <p className="font-medium">{formatDate(event.date)}</p>
                  <p className="text-muted-foreground">{event.time} hrs</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span>📍</span>
                <div>
                  <p className="font-medium">{event.venue.name}</p>
                  <p className="text-muted-foreground">
                    {event.venue.address}, {event.venue.city}
                  </p>
                </div>
              </div>
              {event.organizer.phone && (
                <div className="flex items-start gap-3">
                  <span>📞</span>
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
