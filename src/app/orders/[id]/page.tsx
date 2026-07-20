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
import { CopyAmountButton } from "@/components/orders/CopyAmountButton";
import { Stepper } from "@/components/ui/Stepper";
import { orderReference } from "@/lib/utils";
import { PartyPopperIcon, XIcon } from "@/components/ui/icons";

const PAYMENT_STEPS = ["Transferir", "Subir comprobante", "Confirmación"];

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
          category: true,
          status: true,
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
  const totalTickets = order.items.reduce((sum, item) => sum + item.quantity, 0);
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
        <>
          <Stepper
            steps={PAYMENT_STEPS}
            current={1}
            className="mx-auto max-w-md"
          />
          <p className="text-center font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Pedido ORD-{orderReference(order.id)} · {order.event.title} ·{" "}
            {totalTickets} boleto{totalTickets === 1 ? "" : "s"}
          </p>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
            <div className="order-2 flex flex-col gap-6 lg:order-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    Transferí el monto exacto
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  {order.paymentQrUrl ? (
                    <Image
                      src={order.paymentQrUrl}
                      alt="QR de pago del organizador"
                      width={260}
                      height={260}
                      className="h-auto max-w-full rounded-md border border-border bg-qr-frame p-2"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      El organizador no cargó un QR de pago. Contactalo para
                      coordinar la transferencia.
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold tabular-nums">
                      {formatCurrency(total)}
                    </p>
                    <CopyAmountButton value={formatCurrency(total)} />
                  </div>
                  {organizerContact}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      2
                    </span>
                    Subí tu comprobante
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <UploadProofForm orderId={order.id} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      3
                    </span>
                    Esperá la confirmación
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    El organizador revisa tu comprobante. Te avisamos por
                    correo y tus boletos aparecen en Mis pedidos.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="order-1 lg:order-2 lg:sticky lg:top-20">
              <Card>
                <CardHeader>
                  <CardTitle>Tu pedido</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <OrderCountdown expiresAt={order.expiresAt.toISOString()} />
                  <ul className="flex w-full flex-col gap-1.5 text-sm">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          {itemLabel(item)}
                        </span>
                        <span className="tabular-nums">
                          {formatCurrency(
                            Number(item.unitPrice) * item.quantity,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex w-full justify-between border-t border-border pt-2 text-sm font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    Los boletos se emiten cuando el organizador confirma tu
                    pago. Si el tiempo expira, los asientos se liberan y
                    podés volver a intentar.
                  </p>
                  <CancelOrderButton orderId={order.id} />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {order.status === "PAYMENT_SUBMITTED" && (
        <>
          <Stepper
            steps={PAYMENT_STEPS}
            current={2}
            className="mx-auto max-w-md"
          />
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
                          {formatCurrency(
                            Number(item.unitPrice) * item.quantity,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {order.status === "CONFIRMED" && (
        <>
          <Card>
            <CardContent className="flex items-center gap-3 p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
                <PartyPopperIcon className="h-5 w-5" />
              </span>
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
                  eventDate: order.event.date,
                  eventTime: order.event.time,
                  venueName: order.event.venue.name,
                  venueCity: order.event.venue.city,
                  category: order.event.category,
                  usedAt: ticket.usedAt,
                }}
              />
            ))}
          </div>
        </>
      )}

      {order.status === "CANCELLED" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <XIcon className="h-6 w-6" />
          </span>
          <p className="font-medium">Este pedido fue cancelado</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {order.rejectionReason
              ? `Tu comprobante no pudo verificarse. Motivo: ${order.rejectionReason} Los asientos fueron liberados; podés intentar de nuevo.`
              : order.event.status === "CANCELLED"
                ? "El organizador canceló este evento. Contactalo para coordinar la devolución de tu pago."
                : "No recibimos el pago a tiempo o cancelaste el pedido. Los asientos volvieron a estar disponibles; podés intentar de nuevo."}
          </p>
          {organizerContact}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {order.event.status !== "CANCELLED" && (
              <Link
                href={`/events/${order.event.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                Volver a intentar
              </Link>
            )}
            <Link
              href="/events"
              className={buttonVariants({
                variant: order.event.status === "CANCELLED" ? "primary" : "outline",
                size: "sm",
              })}
            >
              Ver otros eventos
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
