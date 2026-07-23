import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckIcon, EyeIcon } from "@/components/ui/icons";
import { OrderActions } from "@/components/dashboard/OrderActions";
import { ProofImage } from "@/components/dashboard/ProofImage";
import { orderItemsSummary, type OrderItemLike } from "@/lib/order-items";
import { cn, formatCurrency, orderReference } from "@/lib/utils";

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

function ageLabel(minutes: number) {
  return `hace ${minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`}`;
}

/* FIFO queue of PAYMENT_SUBMITTED orders, FIFO by wait time (spec #6b).
   The gold treatment lives in the summary banner above this card on the
   dashboard home — this card's own header stays neutral. */
export function ReviewQueue({
  orders,
  totalCount,
}: {
  orders: ReviewQueueOrder[];
  totalCount: number;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border-soft px-5 py-4">
        <h2 className="font-semibold">Comprobantes por revisar</h2>
        <span
          aria-live="polite"
          className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-bold text-gold"
        >
          {totalCount} pendiente{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<CheckIcon />}
          title="Estás al día"
          description="No hay comprobantes esperando revisión por ahora."
        />
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border-soft">
            {orders.map((order) => {
              const age = order.paymentSubmittedAt
                ? waitingMinutes(order.paymentSubmittedAt)
                : 0;
              const aged = age >= 30;
              return (
                <div
                  key={order.id}
                  className={cn(
                    "flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6",
                    aged && "bg-gold-soft/40",
                  )}
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
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                            aged
                              ? "bg-warning/15 text-warning"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {ageLabel(age)}
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium">
                        {order.buyer.name ?? order.buyer.email} ·{" "}
                        {order.event.title}
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

          {totalCount > orders.length && (
            <div className="flex justify-center border-t border-border-soft p-3">
              <Link
                href="/dashboard/orders"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Ver los {totalCount} pendientes →
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
