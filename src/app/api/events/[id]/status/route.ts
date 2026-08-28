import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseOrderHolds } from "@/lib/seats";
import { requireRole } from "@/lib/api-auth";
import { eventStatusActionSchema } from "@/lib/validations/event";
import {
  eventCancelledEmail,
  eventPendingReviewEmail,
  sendEmail,
} from "@/lib/email";
import { LIVE_ORDER_STATUSES } from "@/lib/seats";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (event.organizerId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "No tenés permisos sobre este evento" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = eventStatusActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }

  const { action } = parsed.data;

  if (action === "submit") {
    if (event.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Solo los borradores pueden enviarse a revisión" },
        { status: 409 },
      );
    }
    if (!event.paymentQrImage) {
      return NextResponse.json(
        { error: "Subí el QR de pago antes de enviar el evento a revisión" },
        { status: 409 },
      );
    }
    const updated = await prisma.event.update({
      where: { id },
      data: { status: "PENDING" },
    });

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", suspended: false },
      select: { email: true },
    });
    const origin = new URL(request.url).origin;
    const { subject, html } = eventPendingReviewEmail(
      event.title,
      session.user.name ?? null,
      `${origin}/admin/events`,
    );
    await Promise.all(
      admins.map((admin) => sendEmail({ to: admin.email, subject, html })),
    );

    return NextResponse.json({ event: updated });
  }

  // action === "cancel"
  if (event.status !== "PENDING" && event.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Este evento no se puede cancelar" },
      { status: 409 },
    );
  }

  // Everyone still holding something for this event, captured BEFORE the
  // cascade cancels their orders (afterwards they'd no longer be "live").
  const affected = await prisma.order.findMany({
    where: { eventId: id, status: { in: LIVE_ORDER_STATUSES } },
    select: {
      id: true,
      status: true,
      buyer: { select: { name: true, email: true } },
    },
  });

  const [claimed] = await prisma.$transaction([
    // Guarded like every other status change: a second cancel is a no-op.
    prisma.event.updateMany({
      where: { id, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "CANCELLED" },
    }),
    // Unpaid and in-review orders die with the event; the tables/seats they
    // held are handed back right after the transaction.
    prisma.order.updateMany({
      where: {
        eventId: id,
        status: { in: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED"] },
      },
      data: {
        status: "CANCELLED",
        rejectionReason: "El organizador canceló el evento.",
      },
    }),
    // Paid orders stay CONFIRMED (the money was really paid and the refund
    // is arranged off-platform), but their tickets stop being valid so the
    // door scanner rejects them.
    prisma.ticket.updateMany({
      where: { eventId: id, status: "VALID" },
      data: { status: "CANCELLED" },
    }),
  ]);

  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "Este evento no se puede cancelar" },
      { status: 409 },
    );
  }

  // Put every spot those cancelled orders were holding back on sale
  await releaseOrderHolds(affected.map((order) => order.id));

  const origin = new URL(request.url).origin;
  const organizer = await prisma.user.findUnique({
    where: { id: event.organizerId },
    select: { phone: true },
  });
  const results = await Promise.all(
    affected.map((order) => {
      const { subject, html } = eventCancelledEmail(
        order.buyer.name,
        event.title,
        order.status === "CONFIRMED",
        organizer?.phone ?? null,
        `${origin}/events`,
      );
      return sendEmail({ to: order.buyer.email, subject, html });
    }),
  );
  const emailsFailed = results.filter((result) => !result.ok).length;
  if (emailsFailed > 0) {
    console.error(
      `[email] ${emailsFailed}/${affected.length} cancellation emails failed for event ${id}`,
    );
  }

  return NextResponse.json({
    event: { ...event, status: "CANCELLED" },
    notified: affected.length - emailsFailed,
    emailsFailed,
  });
}
