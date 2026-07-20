import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import type { OrderStatus } from "@/generated/prisma/enums";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TicketIcon } from "@/components/ui/icons";
import { PendingTimeRemaining } from "@/components/orders/PendingTimeRemaining";

export const metadata: Metadata = {
  title: "Mis pedidos",
};

/** Pending first (needs the buyer's attention), then confirmed, then
 * cancelled last (dimmed, historical). */
const STATUS_RANK: Record<OrderStatus, number> = {
  PENDING_PAYMENT: 0,
  PAYMENT_SUBMITTED: 0,
  CONFIRMED: 1,
  CANCELLED: 2,
};

const FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "confirmados", label: "Confirmados" },
  { value: "pendientes", label: "Pendientes" },
] as const;
type OrderFilter = (typeof FILTERS)[number]["value"];

type PageProps = { searchParams: Promise<{ filtro?: string }> };

export default async function OrdersPage({ searchParams }: PageProps) {
  const session = await auth();
  await expireStaleOrders();

  const { filtro } = await searchParams;
  const activeFilter: OrderFilter = FILTERS.some((f) => f.value === filtro)
    ? (filtro as OrderFilter)
    : "todos";

  const orders = await prisma.order.findMany({
    where: {
      buyerId: session!.user.id,
      ...(activeFilter === "confirmados" ? { status: "CONFIRMED" } : {}),
      ...(activeFilter === "pendientes"
        ? { status: { in: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED"] } }
        : {}),
    },
    include: {
      event: { select: { title: true, date: true, time: true, status: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  orders.sort((a, b) => {
    const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rankDiff !== 0) return rankDiff;
    // Confirmed orders surface by upcoming event date; pending/cancelled
    // stay ordered by most-recently-created.
    if (a.status === "CONFIRMED" && b.status === "CONFIRMED") {
      return a.event.date.getTime() - b.event.date.getTime();
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Mis pedidos</h1>

      <div className="flex gap-2">
        {FILTERS.map((filter) => {
          const active = filter.value === activeFilter;
          return (
            <Link
              key={filter.value}
              href={filter.value === "todos" ? "/orders" : `/orders?filtro=${filter.value}`}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<TicketIcon />}
          title="Todavía no tenés boletos"
          description="Cuando compres uno, aparece acá con su QR listo para la puerta."
          action={
            <Link href="/events" className={buttonVariants({ size: "sm" })}>
              Explorar eventos
            </Link>
          }
          className="flex-1 py-24"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => {
            const statusInfo = ORDER_STATUS_LABELS[order.status];
            const cancelled = order.status === "CANCELLED";
            const eventCancelled = order.event.status === "CANCELLED";
            return (
              <Card
                key={order.id}
                className={cancelled ? "opacity-[0.55]" : undefined}
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        className={
                          cancelled
                            ? "font-semibold line-through"
                            : "font-semibold"
                        }
                      >
                        {order.event.title}
                      </h2>
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                      {order.status === "PENDING_PAYMENT" && (
                        <PendingTimeRemaining
                          expiresAt={order.expiresAt.toISOString()}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(order.event.date)} · {order.event.time} hrs ·{" "}
                      {formatCurrency(Number(order.totalAmount))}
                      {order._count.tickets > 0 &&
                        ` · ${order._count.tickets} boleto${order._count.tickets === 1 ? "" : "s"}`}
                    </p>
                    {cancelled && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {order.rejectionReason
                          ? `Motivo: ${order.rejectionReason}`
                          : eventCancelled
                            ? "El organizador canceló este evento"
                            : null}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/orders/${order.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Ver pedido
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
