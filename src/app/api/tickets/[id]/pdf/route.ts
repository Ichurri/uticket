import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { formatDate } from "@/lib/utils";
import { buildTicketPdf } from "@/lib/ticket-pdf";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("BUYER", "ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      order: {
        select: { buyerId: true, buyer: { select: { name: true, email: true } } },
      },
      event: {
        select: {
          title: true,
          date: true,
          time: true,
          organizerId: true,
          venue: { select: { name: true, city: true } },
        },
      },
      seat: { select: { row: true, number: true } },
      zone: { select: { name: true } },
    },
  });
  if (
    !ticket ||
    !ticket.qrCode ||
    (ticket.order.buyerId !== session.user.id &&
      ticket.event.organizerId !== session.user.id &&
      session.user.role !== "ADMIN")
  ) {
    return NextResponse.json({ error: "Boleto no encontrado" }, { status: 404 });
  }

  const pdf = await buildTicketPdf({
    eventTitle: ticket.event.title,
    dateLabel: formatDate(ticket.event.date),
    timeLabel: `${ticket.event.time} hrs`,
    venueLabel: `${ticket.event.venue.name}, ${ticket.event.venue.city}`,
    seatLabel: ticket.seat
      ? `${ticket.zone?.name ?? ""} · Asiento ${ticket.seat.row}${ticket.seat.number}`
      : (ticket.zone?.name ?? "Entrada general"),
    buyerName: ticket.order.buyer.name ?? ticket.order.buyer.email ?? "—",
    code: ticket.code,
    qrDataUrl: ticket.qrCode,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="boleto-${ticket.code.slice(0, 8)}.pdf"`,
    },
  });
}
