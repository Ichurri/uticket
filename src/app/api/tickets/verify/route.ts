import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { verifyTicketSchema } from "@/lib/validations/ticket";
import { ticketLabel } from "@/lib/order-items";

function ticketSummary(ticket: {
  code: string;
  event: { title: string; date: Date; time: string };
  zoneName: string | null;
  tableLabel: string | null;
  seatLabel: string | null;
  inclusionSummary: string | null;
  order: { buyer: { name: string | null; email: string | null } };
}) {
  return {
    code: ticket.code,
    eventTitle: ticket.event.title,
    eventDate: ticket.event.date.toISOString(),
    eventTime: ticket.event.time,
    // Deliberately no group size here: one QR is always exactly one person,
    // and a "8" next to a green VÁLIDO invites the door to wave in a table.
    label: ticketLabel(ticket),
    /// What the price included, so the door/bar can honour it
    inclusion: ticket.inclusionSummary,
    buyerName: ticket.order.buyer.name ?? ticket.order.buyer.email ?? "—",
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifyTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { result: "INVALID_CODE", error: "El código escaneado no es un boleto válido" },
      { status: 400 },
    );
  }

  // Door staff authenticate with the event's scan code instead of a session
  let scanEventId: string | null = null;
  let sessionUserId: string | null = null;
  let isAdmin = false;

  if (parsed.data.scanCode) {
    const scanEvent = await prisma.event.findUnique({
      where: { scanCode: parsed.data.scanCode },
      select: { id: true },
    });
    if (!scanEvent) {
      return NextResponse.json(
        { result: "FORBIDDEN", error: "El código de acceso de puerta no es válido" },
        { status: 403 },
      );
    }
    scanEventId = scanEvent.id;
  } else {
    const { session, error } = await requireRole("ORGANIZER", "ADMIN");
    if (error) return error;
    sessionUserId = session.user.id;
    isAdmin = session.user.role === "ADMIN";
  }

  const ticket = await prisma.ticket.findUnique({
    where: { code: parsed.data.code },
    include: {
      event: {
        select: {
          title: true,
          date: true,
          time: true,
          organizerId: true,
          status: true,
        },
      },
      order: {
        select: { status: true, buyer: { select: { name: true, email: true } } },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json(
      { result: "NOT_FOUND", error: "Este boleto no existe" },
      { status: 404 },
    );
  }

  const allowed = scanEventId
    ? ticket.eventId === scanEventId
    : isAdmin || ticket.event.organizerId === sessionUserId;
  if (!allowed) {
    return NextResponse.json(
      { result: "FORBIDDEN", error: "Este boleto pertenece a otro evento" },
      { status: 403 },
    );
  }

  // A ticket is only good if the ticket, its event and its order all still
  // stand. Checking just the ticket used to let a cancelled event's tickets
  // walk in through the door.
  const rejection =
    ticket.status === "CANCELLED"
      ? "Este boleto fue cancelado"
      : ticket.event.status === "CANCELLED"
        ? "El evento fue cancelado"
        : ticket.order.status !== "CONFIRMED"
          ? "El pedido de este boleto ya no está confirmado"
          : null;
  if (rejection) {
    return NextResponse.json(
      {
        result: "CANCELLED",
        error: rejection,
        ticket: ticketSummary(ticket),
      },
      { status: 409 },
    );
  }

  // Atomic check-in: flip to USED only if still VALID, so a duplicated QR
  // scanned twice (or on two devices at once) is accepted exactly once.
  const accepted = await prisma.ticket.updateMany({
    where: { id: ticket.id, status: "VALID" },
    data: { status: "USED", usedAt: new Date() },
  });

  if (accepted.count === 0) {
    const current = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      select: { usedAt: true },
    });
    return NextResponse.json(
      {
        result: "ALREADY_USED",
        error: "Este boleto ya fue utilizado",
        usedAt: current?.usedAt?.toISOString() ?? null,
        ticket: ticketSummary(ticket),
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    result: "ACCEPTED",
    ticket: ticketSummary(ticket),
  });
}
