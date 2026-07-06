import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CATEGORY_EMOJIS } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

type PageProps = { params: Promise<{ id: string }> };

async function getApprovedEvent(id: string) {
  return prisma.event.findUnique({
    where: { id, status: "APPROVED" },
    include: {
      organizer: { select: { name: true } },
      venue: {
        include: {
          zones: {
            include: {
              _count: {
                select: { seats: { where: { status: "AVAILABLE" } } },
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
  const event = await getApprovedEvent(id);
  return { title: event?.title ?? "Evento" };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const event = await getApprovedEvent(id);
  if (!event) notFound();

  const basePrice = Number(event.price);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/25 via-primary/10 to-accent/20">
            {event.coverImage ? (
              <Image
                src={event.coverImage}
                alt={event.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 66vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-7xl">
                {CATEGORY_EMOJIS[event.category] ?? "🎟️"}
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">{event.category}</Badge>
              <span className="text-sm text-muted-foreground">
                Organiza: {event.organizer.name ?? "BoletaVIP"}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-bold">{event.title}</h1>
          </div>

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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zonas y precios</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {event.venue.zones.map((zone) => {
                const numbered = zone.rows !== null;
                const available = numbered ? zone._count.seats : zone.capacity;
                return (
                  <div
                    key={zone.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{zone.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {numbered
                          ? `Asientos numerados · ${available} disponibles`
                          : `Capacidad libre · ${available} cupos`}
                      </p>
                    </div>
                    <p className="font-semibold text-primary">
                      {formatCurrency(basePrice * Number(zone.priceMultiplier))}
                    </p>
                  </div>
                );
              })}

              <Button disabled className="w-full">
                Comprar boletos (próximamente)
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                La selección de asientos y la compra llegan en la Fase 3.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
