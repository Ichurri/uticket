import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { OrderCountdown } from "@/components/orders/OrderCountdown";
import { CancelOrderButton } from "@/components/orders/CancelOrderButton";
import { TicketCard } from "@/components/orders/TicketCard";
import { UploadProofForm } from "@/components/orders/UploadProofForm";

export const metadata: Metadata = {
  title: "Pedido",
};

type PageProps = { params: Promise<{ id: string }> };

function itemLabel(item: {
  quantity: number;
  seat: { row: string; number: number } | null;
  zone: { name: string } | null;
}) {
  if (item.seat) {
    return `${item.zone?.name ?? ""} · Asiento ${item.seat.row}${item.seat.number}`;
  }
  return `${item.zone?.name ?? "Zona"} × ${item.quantity}`;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  await expireStaleOrders();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          seat: { select: { row: true, number: true } },
          zone: { select: { name: true } },
        },
      },
      tickets: {
        include: {
          seat: { select: { row: true, number: true } },
          zone: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      event: {
        select: {
          id: true,
          title: true,
          date: true,
          time: true,
          organizerId: true,
          organizer: { select: { phone: true } },
          venue: { select: { name: true, city: true } },
        },
      },
    },
  });

  const user = session!.user;
  if (
    !order ||
    (order.buyerId !== user.id &&
      order.event.organizerId !== user.id &&
      user.role !== "ADMIN")
  ) {
    notFound();
  }

  const statusInfo = ORDER_STATUS_LABELS[order.status];
  const total = Number(order.totalAmount);
  const organizerPhone = order.event.organizer.phone;
  const organizerContact = organizerPhone ? (
    <p className="text-sm text-muted-foreground">
      ¿Dudas con el pago? Contactá al organizador:{" "}
      <a
        href={`https://wa.me/${organizerPhone.replace(/\D/g, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline"
      >
        {organizerPhone}
      </a>
    </p>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{order.event.title}</h1>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(order.event.date)} · {order.event.time} hrs ·{" "}
            {order.event.venue.name}, {order.event.venue.city}
          </p>
        </div>
        <Link
          href="/orders"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← Mis pedidos
        </Link>
      </div>

      {order.status === "PENDING_PAYMENT" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pagá con QR</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {order.paymentQrUrl ? (
                <Image
                  src={order.paymentQrUrl}
                  alt="QR de pago del organizador"
                  width={260}
                  height={260}
                  className="h-auto max-w-full rounded-md border border-border bg-white p-2"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  El organizador no cargó un QR de pago. Contactalo para
                  coordinar la transferencia.
                </p>
              )}
              <p className="text-2xl font-bold tabular-nums">
                {formatCurrency(total)}
              </p>
              <OrderCountdown expiresAt={order.expiresAt.toISOString()} />
              <CancelOrderButton orderId={order.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Instrucciones</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
                <li>Abrí la app de tu banco y escaneá el QR.</li>
                <li>
                  Transferí el monto exacto:{" "}
                  <strong className="text-foreground">
                    {formatCurrency(total)}
                  </strong>
                  .
                </li>
                <li>
                  Sacale captura al comprobante de la transferencia y subilo
                  acá abajo.
                </li>
                <li>
                  El organizador verificará tu comprobante y tus boletos con
                  QR aparecerán en esta misma página.
                </li>
              </ol>
              {organizerContact}

              <div className="border-t border-border pt-4">
                <UploadProofForm orderId={order.id} />
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-semibold">Tu pedido</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">
                        {itemLabel(item)}
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(Number(item.unitPrice) * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {order.status === "PAYMENT_SUBMITTED" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Comprobante en revisión</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Recibimos tu comprobante y el organizador lo está revisando.
                Te avisaremos por correo cuando tus boletos estén listos — no
                hace falta que te quedes en esta página.
              </p>
              {organizerContact}
              {order.paymentProof && (
                <a
                  href={`/api/orders/${order.id}/proof`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-md border border-border"
                >
                  <Image
                    src={`/api/orders/${order.id}/proof`}
                    alt="Comprobante de pago enviado"
                    width={480}
                    height={320}
                    unoptimized
                    className="max-h-72 w-full bg-white object-contain"
                  />
                </a>
              )}
              {order.paymentSubmittedAt && (
                <p className="text-xs text-muted-foreground">
                  Enviado el {formatDateTime(order.paymentSubmittedAt)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>¿Te equivocaste de imagen?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Podés reemplazar el comprobante mientras el organizador no lo
                haya revisado.
              </p>
              <UploadProofForm orderId={order.id} replacing />

              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-semibold">Tu pedido</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">
                        {itemLabel(item)}
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(Number(item.unitPrice) * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {order.status === "CONFIRMED" && (
        <>
          <Card>
            <CardContent className="flex items-center gap-3 p-6">
              <span className="text-3xl">🎉</span>
              <div>
                <p className="font-semibold">¡Pago confirmado!</p>
                <p className="text-sm text-muted-foreground">
                  Estos son tus boletos. Mostrá el QR en la entrada del evento
                  o descargalo para tenerlo a mano.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {order.tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={{
                  id: ticket.id,
                  code: ticket.code,
                  qrCode: ticket.qrCode,
                  status: ticket.status,
                  label: ticket.seat
                    ? `${ticket.zone?.name ?? ""} · Asiento ${ticket.seat.row}${ticket.seat.number}`
                    : (ticket.zone?.name ?? "Entrada general"),
                  eventTitle: order.event.title,
                }}
              />
            ))}
          </div>
        </>
      )}

      {order.status === "CANCELLED" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <span className="text-5xl">😕</span>
          <p className="font-medium">Este pedido fue cancelado</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {order.rejectionReason
              ? `El organizador rechazó el comprobante. Motivo: ${order.rejectionReason}`
              : "Puede haber expirado el tiempo de pago o haberse cancelado manualmente."}{" "}
            Los asientos fueron liberados; podés intentar de nuevo.
          </p>
          {organizerContact}
          <Link
            href={`/events/${order.event.id}`}
            className={buttonVariants({ size: "sm" })}
          >
            Volver al evento
          </Link>
        </div>
      )}
    </div>
  );
}
