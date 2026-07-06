import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/lib/orders";
import { formatCurrency } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Administración",
};

export default async function AdminPage() {
  await expireStaleOrders();

  const [
    userCount,
    organizerCount,
    suspendedCount,
    eventCount,
    pendingEvents,
    approvedEvents,
    salesAggregate,
    ticketCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "ORGANIZER" } }),
    prisma.user.count({ where: { suspended: true } }),
    prisma.event.count(),
    prisma.event.count({ where: { status: "PENDING" } }),
    prisma.event.count({ where: { status: "APPROVED" } }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: "CONFIRMED" },
    }),
    prisma.ticket.count({ where: { status: { not: "CANCELLED" } } }),
  ]);

  const stats = [
    {
      label: "Ventas confirmadas",
      value: formatCurrency(Number(salesAggregate._sum.totalAmount ?? 0)),
    },
    { label: "Boletos emitidos", value: String(ticketCount) },
    { label: "Usuarios registrados", value: String(userCount) },
    { label: "Organizadores", value: String(organizerCount) },
    { label: "Eventos totales", value: String(eventCount) },
    { label: "Eventos aprobados", value: String(approvedEvents) },
    { label: "Eventos por revisar", value: String(pendingEvents) },
    { label: "Cuentas suspendidas", value: String(suspendedCount) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Panel de administración</h1>
        <p className="mt-1 text-muted-foreground">
          Métricas globales de la plataforma.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="truncate text-2xl font-bold" title={stat.value}>
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {pendingEvents > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="font-semibold">
                ⏳ {pendingEvents} evento{pendingEvents === 1 ? "" : "s"}{" "}
                esperando revisión
              </p>
              <p className="text-sm text-muted-foreground">
                Los organizadores no pueden vender hasta que apruebes sus
                eventos.
              </p>
            </div>
            <Link href="/admin/events" className={buttonVariants({ size: "sm" })}>
              Revisar eventos
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
