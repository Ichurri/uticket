import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orderItemInclude } from "@/lib/order-includes";
import { requireRole } from "@/lib/api-auth";
import { expireStaleOrders } from "@/lib/orders";
import { csvLine } from "@/lib/csv";
import { orderItemsSummary } from "@/lib/order-items";
import { formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  await expireStaleOrders();

  const event = await prisma.event.findUnique({
    where: { id },
    select: { organizerId: true },
  });
  if (
    !event ||
    (event.organizerId !== session.user.id && session.user.role !== "ADMIN")
  ) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const orders = await prisma.order.findMany({
    where: {
      eventId: id,
      status: { in: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED", "CONFIRMED"] },
    },
    include: {
      buyer: { select: { name: true, email: true } },
      items: {
        include: {
        ...orderItemInclude,
        },
      },
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const lines = [
    csvLine(["Comprador", "Correo", "Estado", "Detalle", "Boletos", "Monto (Bs)", "Fecha"]),
    ...orders.map((order) =>
      csvLine([
        order.buyer.name ?? "",
        order.buyer.email,
        ORDER_STATUS_LABELS[order.status].label,
        orderItemsSummary(order.items),
        order._count.tickets,
        Number(order.totalAmount).toFixed(2),
        formatDateTime(order.createdAt),
      ]),
    ),
  ];

  // Leading BOM so Excel opens the file as UTF-8
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compradores-${id}.csv"`,
    },
  });
}
