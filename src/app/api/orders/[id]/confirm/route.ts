import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { expireStaleOrders } from "@/lib/orders";
import type { TicketStatus } from "@/generated/prisma/enums";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  await expireStaleOrders();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      event: { select: { id: true, organizerId: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }
  if (
    order.event.organizerId !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return NextResponse.json(
      { error: "No tenés permisos sobre este pedido" },
      { status: 403 },
    );
  }
  if (order.status !== "PENDING_PAYMENT") {
    return NextResponse.json(
      { error: "Este pedido ya no está pendiente de pago" },
      { status: 409 },
    );
  }

  // One ticket per seat item; N tickets for zone items with quantity N
  const ticketsData: {
    code: string;
    qrCode: string;
    orderId: string;
    eventId: string;
    seatId: string | null;
    zoneId: string | null;
    status: TicketStatus;
  }[] = [];

  for (const item of order.items) {
    const count = item.seatId ? 1 : item.quantity;
    for (let i = 0; i < count; i++) {
      const code = randomUUID();
      const qrCode = await QRCode.toDataURL(code, { width: 320, margin: 2 });
      ticketsData.push({
        code,
        qrCode,
        orderId: order.id,
        eventId: order.event.id,
        seatId: item.seatId,
        zoneId: item.zoneId,
        status: "VALID",
      });
    }
  }

  const seatIds = order.items
    .map((item) => item.seatId)
    .filter((seatId): seatId is string => seatId !== null);

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    }),
    prisma.seat.updateMany({
      where: { id: { in: seatIds } },
      data: { status: "SOLD" },
    }),
    prisma.ticket.createMany({ data: ticketsData }),
  ]);

  return NextResponse.json({ ok: true, tickets: ticketsData.length });
}
