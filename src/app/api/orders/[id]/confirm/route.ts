import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { expireStaleOrders } from "@/lib/orders";
import { orderConfirmedEmail, sendEmail } from "@/lib/email";
import { inclusionSummary, ticketCountFor } from "@/lib/order-items";
import { resolveInclusion } from "@/lib/event-zones";
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
      items: {
        include: {
          eventZone: {
            select: {
              id: true,
              price: true,
              defaultInclusionType: true,
              defaultInclusionValue: true,
              defaultInclusionNote: true,
              zone: {
                select: { name: true, floor: { select: { name: true } } },
              },
            },
          },
          eventTable: {
            select: {
              id: true,
              inclusionType: true,
              inclusionValue: true,
              inclusionNote: true,
              table: { select: { label: true, seats: true } },
            },
          },
          eventSeat: {
            select: { id: true, seat: { select: { row: true, number: true } } },
          },
        },
      },
      event: {
        select: {
          id: true,
          title: true,
          organizerId: true,
          venue: { select: { name: true } },
        },
      },
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

  // One ticket per seat, one per person for a whole table, `seatsQuantity`
  // for spots inside a table, `quantity` for a GENERAL zone.
  const ticketsData: {
    code: string;
    qrCode: string;
    orderId: string;
    eventId: string;
    eventZoneId: string | null;
    eventTableId: string | null;
    eventSeatId: string | null;
    venueName: string;
    floorName: string | null;
    zoneName: string | null;
    tableLabel: string | null;
    seatLabel: string | null;
    priceAtPurchase: number;
    inclusionSummary: string | null;
    status: TicketStatus;
  }[] = [];

  for (const item of order.items) {
    const count = ticketCountFor(item);
    // Frozen at purchase: the layout is editable between events, so a renamed
    // or deleted zone must never break a ticket that was already sold.
    const inclusion = item.eventZone
      ? resolveInclusion(item.eventTable, item.eventZone)
      : null;

    for (let i = 0; i < count; i++) {
      const code = randomUUID();
      const qrCode = await QRCode.toDataURL(code, { width: 320, margin: 2 });
      ticketsData.push({
        code,
        qrCode,
        orderId: order.id,
        eventId: order.event.id,
        eventZoneId: item.eventZoneId,
        eventTableId: item.eventTableId,
        eventSeatId: item.eventSeatId,
        venueName: order.event.venue.name,
        floorName: item.eventZone?.zone.floor.name ?? null,
        zoneName: item.eventZone?.zone.name ?? null,
        tableLabel: item.eventTable?.table.label ?? null,
        seatLabel: item.eventSeat
          ? `${item.eventSeat.seat.row}${item.eventSeat.seat.number}`
          : null,
        priceAtPurchase: Number(item.unitPrice),
        inclusionSummary: inclusion ? inclusionSummary(inclusion) : null,
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

      // Paid holds become permanent: HELD → SOLD, and the hold clock stops.
      const tableIds = order.items
        .map((item) => item.eventTableId)
        .filter((tableId): tableId is string => tableId !== null);
      const seatIds = order.items
        .map((item) => item.eventSeatId)
        .filter((seatId): seatId is string => seatId !== null);

      if (tableIds.length > 0) {
        await tx.eventTable.updateMany({
          where: { id: { in: tableIds } },
          data: { status: "SOLD", heldUntil: null },
        });
      }
      if (seatIds.length > 0) {
        await tx.eventSeat.updateMany({
          where: { id: { in: seatIds } },
          data: { status: "SOLD", heldUntil: null },
        });
      }

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
