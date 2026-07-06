import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Mis pedidos",
};

export default async function OrdersPage() {
  const session = await auth();
  await expireStaleOrders();

  const orders = await prisma.order.findMany({
    where: { buyerId: session!.user.id },
    include: {
      event: { select: { title: true, date: true, time: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Mis pedidos</h1>

      {orders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
          <span className="text-5xl">🧾</span>
          <p className="font-medium">Todavía no tenés pedidos</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Cuando compres boletos, vas a poder seguir el estado de tus pedidos
            y descargar tus entradas desde acá.
          </p>
          <Link href="/eventos" className={buttonVariants({ size: "sm" })}>
            Explorar eventos
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => {
            const statusInfo = ORDER_STATUS_LABELS[order.status];
            return (
              <Card key={order.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{order.event.title}</h2>
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(order.event.date)} · {order.event.time} hrs ·{" "}
                      {formatCurrency(Number(order.totalAmount))}
                      {order._count.tickets > 0 &&
                        ` · ${order._count.tickets} boleto${order._count.tickets === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Link
                    href={`/pedidos/${order.id}`}
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
