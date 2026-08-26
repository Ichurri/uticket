import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { expireStaleOrders } from "@/lib/orders";
import { orderConfirmedEmail, sendEmail } from "@/lib/email";
import type { TicketStatus } from "@/generated/prisma/enums";

type RouteContext = { params: Promise<{ id: string }> };

class ConfirmError extends Error {}

export async function POST(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  await expireStaleOrders();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      event: { select: { id: true, title: true, organizerId: true } },
      buyer: { select: { name: true, email: true } },
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
  if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_SUBMITTED") {
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

  try {
    await prisma.$transaction(async (tx) => {
      // Atomic claim: only one concurrent confirm can flip the status, so a
      // double click (or organizer + admin at once) can't issue tickets twice.
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { in: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED"] },
        },
        data: { status: "CONFIRMED" },
      });
      if (claimed.count === 0) {
        throw new ConfirmError("Este pedido ya no está pendiente de pago");
      }
      // Nothing to flip on the seats themselves: their occupancy for this
      // event is derived from this order's items and status (src/lib/seats.ts).
      await tx.ticket.createMany({ data: ticketsData });
    });
  } catch (err) {
    if (err instanceof ConfirmError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const origin = new URL(request.url).origin;
  const { subject, html } = orderConfirmedEmail(
    order.buyer.name,
    order.event.title,
    ticketsData.length,
    `${origin}/orders/${order.id}`,
  );
  const emailResult = await sendEmail({ to: order.buyer.email, subject, html });
  if (!emailResult.ok) {
    console.error(`[email] confirmation email failed for order ${order.id}`);
  }

  return NextResponse.json({
    ok: true,
    tickets: ticketsData.length,
    emailSent: emailResult.ok,
  });
}
