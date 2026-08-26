import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createOrderSchema } from "@/lib/validations/order";
import { expireStaleOrders, ORDER_EXPIRY_MINUTES } from "@/lib/orders";
import { findTakenSeatIds, LIVE_ORDER_STATUSES } from "@/lib/seats";
import { getPlatformSettings } from "@/lib/settings";
import { formatCurrency, salesAreClosed } from "@/lib/utils";
import { MAX_PENDING_ORDERS_PER_BUYER } from "@/lib/constants";
import { orderCreatedEmail, sendEmail } from "@/lib/email";
import { Prisma } from "@/generated/prisma/client";

class OrderError extends Error {}

export async function POST(request: Request) {
  const { session, error } = await requireRole("BUYER", "ORGANIZER", "ADMIN");
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const { eventId, zones: zoneItems } = parsed.data;
  const seatIds = [...new Set(parsed.data.seatIds)];

  const buyer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true, name: true, email: true },
  });
  if (!buyer?.emailVerified) {
    return NextResponse.json(
      {
        error:
          "Verificá tu correo antes de comprar. Revisá tu bandeja de entrada o reenviá el correo desde el aviso superior.",
      },
      { status: 403 },
    );
  }

  // Free capacity being held by expired orders before validating availability
  await expireStaleOrders();

  const pendingCount = await prisma.order.count({
    where: { buyerId: session.user.id, status: "PENDING_PAYMENT" },
  });
  if (pendingCount >= MAX_PENDING_ORDERS_PER_BUYER) {
    return NextResponse.json(
      {
        error: `Ya tenés ${pendingCount} pedidos esperando pago. Completá o cancelá alguno antes de crear otro.`,
      },
      { status: 429 },
    );
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId, status: "APPROVED" },
    select: {
      id: true,
      title: true,
      date: true,
      time: true,
      price: true,
      venueId: true,
      paymentQrImage: true,
    },
  });
  if (!event) {
    return NextResponse.json(
      { error: "El evento no existe o no está disponible" },
      { status: 404 },
    );
  }

  const { orderCutoffHours } = await getPlatformSettings();
  if (salesAreClosed(event, orderCutoffHours)) {
    return NextResponse.json(
      {
        error:
          orderCutoffHours > 0
            ? `Las ventas para este evento cerraron (se cierran ${orderCutoffHours} h antes del inicio)`
            : "Este evento ya comenzó",
      },
      { status: 409 },
    );
  }

  const basePrice = Number(event.price);

  // Validate seats: must exist, belong to this event's venue
  const seats = await prisma.seat.findMany({
    where: { id: { in: seatIds }, zone: { venueId: event.venueId } },
    include: { zone: { select: { id: true, name: true, priceMultiplier: true } } },
  });
  if (seats.length !== seatIds.length) {
    return NextResponse.json(
      { error: "Alguno de los asientos elegidos no existe para este evento" },
      { status: 400 },
    );
  }

  // Validate free-capacity zones: must belong to the venue and not be numbered
  const zoneIds = zoneItems.map((item) => item.zoneId);
  const freeZones = await prisma.zone.findMany({
    where: { id: { in: zoneIds }, venueId: event.venueId, rows: null },
  });
  if (freeZones.length !== zoneIds.length) {
    return NextResponse.json(
      { error: "Alguna de las zonas elegidas no existe para este evento" },
      { status: 400 },
    );
  }
  const freeZoneById = new Map(freeZones.map((zone) => [zone.id, zone]));

  const itemsData = [
    ...seats.map((seat) => ({
      seatId: seat.id,
      zoneId: seat.zone.id,
      quantity: 1,
      unitPrice: basePrice * Number(seat.zone.priceMultiplier),
    })),
    ...zoneItems.map((item) => {
      const zone = freeZoneById.get(item.zoneId)!;
      return {
        zoneId: zone.id,
        quantity: item.quantity,
        unitPrice: basePrice * Number(zone.priceMultiplier),
      };
    }),
  ];
  const totalAmount = itemsData.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        // Availability is scoped to THIS event: the venue's seats are shared
        // by every event held there, so what matters is whether a live order
        // *of this event* already holds them. Serializable isolation is what
        // makes the read-then-insert safe against a concurrent buyer.
        const taken = await findTakenSeatIds(event.id, seatIds, tx);
        if (taken.length > 0) {
          throw new OrderError(
            "Alguno de los asientos elegidos ya no está disponible. Actualizá el mapa e intentá de nuevo.",
          );
        }

        for (const item of zoneItems) {
          const zone = freeZoneById.get(item.zoneId)!;
          const committed = await tx.orderItem.aggregate({
            _sum: { quantity: true },
            where: {
              zoneId: zone.id,
              seatId: null,
              order: { eventId: event.id, status: { in: LIVE_ORDER_STATUSES } },
            },
          });
          const committedQuantity = committed._sum.quantity ?? 0;
          if (committedQuantity + item.quantity > zone.capacity) {
            throw new OrderError(
              `No quedan suficientes cupos en la zona ${zone.name} (disponibles: ${Math.max(0, zone.capacity - committedQuantity)})`,
            );
          }
        }

        return tx.order.create({
          data: {
            buyerId: session.user.id,
            eventId: event.id,
            totalAmount,
            status: "PENDING_PAYMENT",
            paymentQrUrl: event.paymentQrImage,
            expiresAt: new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000),
            items: { create: itemsData },
          },
          select: { id: true, expiresAt: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // The buyer has 15 minutes to pay; if they close the tab there is
    // otherwise no way back to this order. Failures never block the response.
    const origin = new URL(request.url).origin;
    const { subject, html } = orderCreatedEmail(
      buyer.name,
      event.title,
      formatCurrency(totalAmount),
      ORDER_EXPIRY_MINUTES,
      `${origin}/orders/${order.id}`,
    );
    void sendEmail({ to: buyer.email, subject, html });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2034"
    ) {
      return NextResponse.json(
        { error: "Hubo mucha demanda en este momento. Intentá de nuevo." },
        { status: 409 },
      );
    }
    throw err;
  }
}
