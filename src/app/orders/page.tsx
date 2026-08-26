import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import {
  cn,
  formatCurrency,
  formatShortDate,
  orderReference,
} from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import type { OrderStatus } from "@/generated/prisma/enums";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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

/* Gradient tints echoing the icon badges elsewhere in the redesign
   (EventCard tags, review-queue rows) — gold for confirmed, violet for
   pending, flat muted once cancelled. */
function badgeClasses(status: OrderStatus) {
  if (status === "CONFIRMED") {
    return {
      bg: "bg-gradient-to-br from-gold/25 to-primary/20",
      icon: "text-gold-bright",
    };
  }
  if (status === "CANCELLED") {
    return { bg: "bg-muted", icon: "text-muted-foreground" };
  }
  return {
    bg: "bg-gradient-to-br from-primary/25 to-accent/15",
    icon: "text-primary",
  };
}

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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
          Mis pedidos
        </h1>
        <span className="h-[3px] w-10 bg-gradient-to-r from-gold to-transparent" />
      </div>

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
        <div className="flex flex-col gap-2.5">
          {orders.map((order) => {
            const statusInfo = ORDER_STATUS_LABELS[order.status];
            const cancelled = order.status === "CANCELLED";
            const pending = order.status === "PENDING_PAYMENT";
            // A paid order stays CONFIRMED when its event dies, so the
            // cancelled event is the thing the buyer actually needs to see.
            const eventCancelled = order.event.status === "CANCELLED";
            const icon = badgeClasses(order.status);
            return (
              <Link key={order.id} href={`/orders/${order.id}`} className="block">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:border-primary/30",
                    (cancelled || eventCancelled) && "opacity-[0.55]",
                    pending && !eventCancelled && "border-gold/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      icon.bg,
                    )}
                  >
                    <TicketIcon className={cn("h-5 w-5", icon.icon)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-semibold",
                        (cancelled || eventCancelled) &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {order.event.title}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      ORD-{orderReference(order.id)} ·{" "}
                      {formatShortDate(order.event.date)}
                      {!cancelled &&
                        ` · ${formatCurrency(Number(order.totalAmount))}`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {eventCancelled ? (
                      <Badge variant="danger">Evento cancelado</Badge>
                    ) : pending ? (
                      <PendingTimeRemaining
                        expiresAt={order.expiresAt.toISOString()}
                      />
                    ) : (
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
