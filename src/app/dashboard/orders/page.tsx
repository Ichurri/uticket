import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orderItemInclude } from "@/lib/order-includes";
import { expireStaleOrders } from "@/lib/orders";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { orderItemsSummary } from "@/lib/order-items";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { OrderActions } from "@/components/dashboard/OrderActions";
import { ProofImage } from "@/components/dashboard/ProofImage";
import { AutoRefresh } from "@/components/layout/AutoRefresh";

export const metadata: Metadata = {
  title: "Pedidos",
};

export default async function DashboardOrdersPage() {
  const session = await auth();
  await expireStaleOrders();

  const orders = await prisma.order.findMany({
    where: { event: { organizerId: session!.user.id } },
    include: {
      buyer: { select: { name: true, email: true } },
      event: { select: { title: true } },
      items: {
        include: {
        ...orderItemInclude,
        },
      },
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const inReview = orders.filter(
    (order) => order.status === "PAYMENT_SUBMITTED",
  );
  const pending = orders.filter((order) => order.status === "PENDING_PAYMENT");
  const history = orders.filter(
    (order) =>
      order.status !== "PENDING_PAYMENT" &&
      order.status !== "PAYMENT_SUBMITTED",
  );

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh intervalMs={15000} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
            Pedidos
          </h1>
          <span className="mt-1.5 block h-[3px] w-10 bg-gradient-to-r from-gold to-transparent" />
          <p className="mt-2 text-muted-foreground">
            Revisá los comprobantes de pago para emitir los boletos.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Actualización automática
        </span>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">
          Comprobantes por revisar ({inReview.length})
        </h2>
        {inReview.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No hay comprobantes esperando revisión. Cuando un comprador suba
              su comprobante de pago, aparecerá acá hasta que lo verifiques o
              rechaces.
            </CardContent>
          </Card>
        ) : (
          inReview.map((order) => (
            <Card key={order.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
                {order.paymentProof && (
                  <ProofImage url={`/api/orders/${order.id}/proof`} />
                )}
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-semibold">
                    {order.buyer.name ?? order.buyer.email} ·{" "}
                    {formatCurrency(Number(order.totalAmount))}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.event.title} · {orderItemsSummary(order.items)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Comprobante subido{" "}
                    {order.paymentSubmittedAt
                      ? formatDateTime(order.paymentSubmittedAt)
                      : "—"}{" "}
                    · tocá la miniatura para ampliarlo
                  </p>
                </div>
                <OrderActions orderId={order.id} hasProof />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">
          Pendientes de pago ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No hay pedidos esperando pago. Cuando un comprador cree un
              pedido, aparecerá acá durante 15 minutos hasta que suba su
              comprobante.
            </CardContent>
          </Card>
        ) : (
          pending.map((order) => (
            <Card key={order.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {order.buyer.name ?? order.buyer.email} ·{" "}
                    {formatCurrency(Number(order.totalAmount))}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.event.title} · {orderItemsSummary(order.items)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Creado {formatDateTime(order.createdAt)} · expira{" "}
                    {formatDateTime(order.expiresAt)}
                  </p>
                </div>
                <OrderActions orderId={order.id} />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Historial ({history.length})</h2>
        {history.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Los pedidos confirmados o cancelados aparecerán acá.
            </CardContent>
          </Card>
        ) : (
          history.map((order) => {
            const statusInfo = ORDER_STATUS_LABELS[order.status];
            return (
              <Card key={order.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {order.buyer.name ?? order.buyer.email} ·{" "}
                        {formatCurrency(Number(order.totalAmount))}
                      </p>
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {order.event.title} · {orderItemsSummary(order.items)}
                      {order._count.tickets > 0 &&
                        ` · ${order._count.tickets} boleto${order._count.tickets === 1 ? "" : "s"} emitido${order._count.tickets === 1 ? "" : "s"}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Creado {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
