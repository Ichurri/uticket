import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EVENT_STATUS_LABELS } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { CalendarIcon, MailIcon, MapPinIcon, PhoneIcon } from "@/components/ui/icons";
import { EventReviewActions } from "@/components/admin/EventReviewActions";

type PageProps = { params: Promise<{ id: string }> };

async function getEvent(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: {
      organizer: { select: { name: true, email: true, phone: true } },
      venue: {
        select: { name: true, address: true, city: true, capacity: true },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: event?.title ?? "Evento" };
}

export default async function AdminEventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const statusInfo = EVENT_STATUS_LABELS[event.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.category} · Enviado el {formatDate(event.createdAt)}
          </p>
        </div>
        <Link
          href="/admin/events"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← Eventos
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-6">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-muted">
            {event.coverImage ? (
              <Image
                src={event.coverImage}
                alt=""
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sin imagen de portada
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Descripción</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {event.description}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lugar</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p className="font-medium">{event.venue.name}</p>
              <p className="text-muted-foreground">
                {event.venue.address}, {event.venue.city}
              </p>
              <p className="text-muted-foreground">
                Capacidad: {event.venue.capacity} personas
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {event.status === "PENDING" && (
            <Card>
              <CardHeader>
                <CardTitle>Revisión</CardTitle>
              </CardHeader>
              <CardContent>
                <EventReviewActions eventId={event.id} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarIcon className="h-4 w-4 shrink-0" />
                {formatDate(event.date)} · {event.time} hrs
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPinIcon className="h-4 w-4 shrink-0" />
                {event.venue.name} ({event.venue.city})
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-muted-foreground">Precio base</span>
                <span className="font-semibold">
                  {formatCurrency(Number(event.price))}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organizador</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="font-medium">
                {event.organizer.name ?? "Sin nombre"}
              </p>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MailIcon className="h-4 w-4 shrink-0" />
                {event.organizer.email}
              </div>
              {event.organizer.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <PhoneIcon className="h-4 w-4 shrink-0" />
                  {event.organizer.phone}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>QR de pago</CardTitle>
            </CardHeader>
            <CardContent>
              {event.paymentQrImage ? (
                <Image
                  src={event.paymentQrImage}
                  alt="QR de pago del organizador"
                  width={260}
                  height={260}
                  className="mx-auto h-auto max-w-full rounded-md border border-border bg-qr-frame p-2"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  El organizador todavía no cargó un QR de pago.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
