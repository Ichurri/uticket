import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { HourglassIcon, EyeIcon } from "@/components/ui/icons";
import { OrderActions } from "@/components/dashboard/OrderActions";
import { ProofImage } from "@/components/dashboard/ProofImage";
import { orderItemsSummary, type OrderItemLike } from "@/lib/order-items";
import { formatCurrency, orderReference } from "@/lib/utils";

export interface ReviewQueueOrder {
  id: string;
  totalAmount: number;
  paymentSubmittedAt: Date | string | null;
  buyer: { name: string | null; email: string };
  event: { title: string };
  items: OrderItemLike[];
}

function waitingMinutes(date: Date | string) {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000));
}

/* FIFO queue of PAYMENT_SUBMITTED orders — the only gold-tinted surface on
   the dashboard home (spec #6b), and it disappears entirely once the
   organizer is caught up. */
export function ReviewQueue({
  orders,
  totalCount,
}: {
  orders: ReviewQueueOrder[];
  totalCount: number;
}) {
  if (orders.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-gold/30">
      <div className="flex items-center justify-between gap-2 bg-gold-soft px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <HourglassIcon className="h-4 w-4 text-gold" />
          <h2
            aria-live="polite"
            className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-gold"
          >
            Comprobantes por revisar · {totalCount}
          </h2>
        </div>
        {totalCount > orders.length && (
          <Link
            href="/dashboard/orders"
            className="text-xs font-medium text-gold hover:underline"
          >
            Ver todos
          </Link>
        )}
      </div>

      <div className="flex flex-col divide-y divide-border-soft bg-card">
        {orders.map((order) => {
          const age = order.paymentSubmittedAt
            ? waitingMinutes(order.paymentSubmittedAt)
            : 0;
          return (
            <div
              key={order.id}
              className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProofImage
                  url={`/api/orders/${order.id}/proof`}
                  thumbClassName="h-11 w-11 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      ORD-{orderReference(order.id)}
                    </span>
                    {age >= 30 && (
                      <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                        Esperando {age >= 60 ? `${Math.floor(age / 60)}h` : `${age}m`}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium">
                    {order.buyer.name ?? order.buyer.email} · {order.event.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {orderItemsSummary(order.items)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 lg:justify-end lg:gap-4">
                <span className="font-mono text-sm font-bold text-gold-bright">
                  {formatCurrency(order.totalAmount)}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/orders/${order.id}`}
                    target="_blank"
                    aria-label="Ver pedido"
                    title="Ver pedido"
                    className={buttonVariants({
                      variant: "ghost",
                      size: "md",
                      className: "w-11 px-0",
                    })}
                  >
                    <EyeIcon className="h-4 w-4" />
                  </Link>
                  <OrderActions orderId={order.id} hasProof compact />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
