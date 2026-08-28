import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { createOrderSchema } from "@/lib/validations/order";
import { expireStaleOrders, ORDER_EXPIRY_MINUTES } from "@/lib/orders";
import { releaseExpiredHolds, LIVE_ORDER_STATUSES } from "@/lib/seats";
import { seatPrice, tablePrice, tableSeatPrice } from "@/lib/event-zones";
import { getPlatformSettings } from "@/lib/settings";
import { formatCurrency, salesAreClosed } from "@/lib/utils";
import { MAX_PENDING_ORDERS_PER_BUYER } from "@/lib/constants";
import { orderCreatedEmail, sendEmail } from "@/lib/email";
import { Prisma } from "@/generated/prisma/client";

class OrderError extends Error {}

/** An EventZone is only sellable while enabled and inside its own window. */
function zoneClosed(
  eventZone: { isEnabled: boolean; salesStartAt: Date | null; salesEndAt: Date | null },
  now: Date,
) {
  if (!eventZone.isEnabled) return true;
  if (eventZone.salesStartAt && eventZone.salesStartAt > now) return true;
  if (eventZone.salesEndAt && eventZone.salesEndAt < now) return true;
  return false;
}

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

  const { eventId } = parsed.data;
  const seatIds = [...new Set(parsed.data.seatIds)];
  const tableRequests = parsed.data.tables;
  const zoneRequests = parsed.data.zones;

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

  // Put back what abandoned checkouts were holding before checking stock
  await expireStaleOrders();
  await releaseExpiredHolds();

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
      paymentQrImage: true,
      venue: { select: { name: true } },
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

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ORDER_EXPIRY_MINUTES * 60 * 1000);

  const eventZoneSelect = {
    id: true,
    price: true,
    seatPrice: true,
    capacityForSale: true,
    isEnabled: true,
    salesStartAt: true,
    salesEndAt: true,
    tableSaleMode: true,
    defaultInclusionType: true,
    defaultInclusionValue: true,
    defaultInclusionNote: true,
    zone: {
      select: {
        id: true,
        name: true,
        type: true,
        capacity: true,
        floor: { select: { name: true } },
      },
    },
  } satisfies Prisma.EventZoneSelect;

  // ---- resolve tables -------------------------------------------------
  const tableIds = tableRequests.map((request) => request.eventTableId);
  const eventTables = await prisma.eventTable.findMany({
    where: { id: { in: tableIds }, eventZone: { eventId: event.id } },
    include: {
      table: { select: { id: true, label: true, seats: true } },
      eventZone: { select: eventZoneSelect },
    },
  });
  if (eventTables.length !== new Set(tableIds).size) {
    return NextResponse.json(
      { error: "Alguna de las mesas elegidas no existe para este evento" },
      { status: 400 },
    );
  }

  // ---- resolve numbered seats ----------------------------------------
  const seats = await prisma.seat.findMany({
    where: { id: { in: seatIds }, zone: { eventZones: { some: { eventId: event.id } } } },
    select: {
      id: true,
      row: true,
      number: true,
      zone: {
        select: {
          id: true,
          eventZones: { where: { eventId: event.id }, select: eventZoneSelect },
        },
      },
    },
  });
  if (seats.length !== seatIds.length) {
    return NextResponse.json(
      { error: "Alguno de los asientos elegidos no existe para este evento" },
      { status: 400 },
    );
  }

  // ---- resolve general zones -----------------------------------------
  const generalZones = await prisma.eventZone.findMany({
    where: {
      id: { in: zoneRequests.map((request) => request.eventZoneId) },
      eventId: event.id,
      zone: { type: "GENERAL" },
    },
    select: eventZoneSelect,
  });
  if (generalZones.length !== new Set(zoneRequests.map((r) => r.eventZoneId)).size) {
    return NextResponse.json(
      { error: "Alguna de las zonas elegidas no existe para este evento" },
      { status: 400 },
    );
  }
  const generalZoneById = new Map(generalZones.map((zone) => [zone.id, zone]));

  // ---- every zone involved must actually be on sale --------------------
  const involvedZones = [
    ...eventTables.map((eventTable) => eventTable.eventZone),
    ...seats.map((seat) => seat.zone.eventZones[0]),
    ...generalZones,
  ];
  for (const eventZone of involvedZones) {
    if (!eventZone || zoneClosed(eventZone, now)) {
      return NextResponse.json(
        {
          error: `La venta de la zona ${eventZone?.zone.name ?? ""} no está abierta`.trim(),
        },
        { status: 409 },
      );
    }
  }

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];
        let totalAmount = 0;

        // ---- tables ----
        for (const request of tableRequests) {
          const eventTable = eventTables.find(
            (candidate) => candidate.id === request.eventTableId,
          )!;
          const eventZone = eventTable.eventZone;
          const perSeat = eventZone.tableSaleMode === "PER_SEAT";

          if (eventTable.status === "BLOCKED") {
            throw new OrderError(
              `La mesa ${eventTable.table.label} no está a la venta`,
            );
          }

          if (perSeat) {
            const wanted = request.seats ?? 1;
            const current = await tx.eventTable.findUniqueOrThrow({
              where: { id: eventTable.id },
              select: { seatsSold: true, status: true },
            });
            if (current.status === "SOLD" || current.status === "BLOCKED") {
              throw new OrderError(
                `La mesa ${eventTable.table.label} ya no tiene lugares`,
              );
            }
            const free = eventTable.table.seats - current.seatsSold;
            if (wanted > free) {
              throw new OrderError(
                `Quedan ${Math.max(0, free)} lugares en la mesa ${eventTable.table.label}`,
              );
            }
            const seatsSold = current.seatsSold + wanted;
            await tx.eventTable.update({
              where: { id: eventTable.id },
              data: {
                seatsSold,
                status: seatsSold >= eventTable.table.seats ? "SOLD" : "HELD",
                heldUntil: expiresAt,
              },
            });
            const unitPrice = tableSeatPrice(eventTable, eventZone);
            totalAmount += unitPrice * wanted;
            itemsData.push({
              eventZoneId: eventZone.id,
              eventTableId: eventTable.id,
              quantity: 1,
              seatsQuantity: wanted,
              unitPrice,
            });
            continue;
          }

          // Whole table: claim it only if it is still free
          const claimed = await tx.eventTable.updateMany({
            where: { id: eventTable.id, status: "AVAILABLE" },
            data: { status: "HELD", heldUntil: expiresAt },
          });
          if (claimed.count === 0) {
            throw new OrderError(
              `La mesa ${eventTable.table.label} ya no está disponible. Actualizá el mapa e intentá de nuevo.`,
            );
          }
          const unitPrice = tablePrice(eventTable, eventZone);
          totalAmount += unitPrice;
          itemsData.push({
            eventZoneId: eventZone.id,
            eventTableId: eventTable.id,
            quantity: 1,
            unitPrice,
          });
        }

        // ---- numbered seats (EventSeat rows are created on demand) ----
        for (const seat of seats) {
          const eventZone = seat.zone.eventZones[0]!;
          const existing = await tx.eventSeat.findUnique({
            where: {
              eventZoneId_seatId: { eventZoneId: eventZone.id, seatId: seat.id },
            },
          });

          if (existing && existing.status !== "AVAILABLE") {
            throw new OrderError(
              `El asiento ${seat.row}${seat.number} ya no está disponible. Actualizá el mapa e intentá de nuevo.`,
            );
          }

          const eventSeat = existing
            ? await tx.eventSeat.update({
                where: { id: existing.id },
                data: { status: "HELD", heldUntil: expiresAt },
              })
            : await tx.eventSeat.create({
                data: {
                  eventZoneId: eventZone.id,
                  seatId: seat.id,
                  status: "HELD",
                  heldUntil: expiresAt,
                },
              });

          const unitPrice = seatPrice(existing, eventZone);
          totalAmount += unitPrice;
          itemsData.push({
            eventZoneId: eventZone.id,
            eventSeatId: eventSeat.id,
            quantity: 1,
            unitPrice,
          });
        }

        // ---- general zones (headcount, no per-spot row) ----
        for (const request of zoneRequests) {
          const eventZone = generalZoneById.get(request.eventZoneId)!;
          const forSale =
            eventZone.capacityForSale ?? eventZone.zone.capacity ?? 0;
          const committed = await tx.orderItem.aggregate({
            _sum: { quantity: true },
            where: {
              eventZoneId: eventZone.id,
              eventTableId: null,
              eventSeatId: null,
              order: { eventId: event.id, status: { in: LIVE_ORDER_STATUSES } },
            },
          });
          const taken = committed._sum.quantity ?? 0;
          if (taken + request.quantity > forSale) {
            throw new OrderError(
              `No quedan suficientes cupos en la zona ${eventZone.zone.name} (disponibles: ${Math.max(0, forSale - taken)})`,
            );
          }
          const unitPrice = Number(eventZone.price);
          totalAmount += unitPrice * request.quantity;
          itemsData.push({
            eventZoneId: eventZone.id,
            quantity: request.quantity,
            unitPrice,
          });
        }

        return tx.order.create({
          data: {
            buyerId: session.user.id,
            eventId: event.id,
            totalAmount,
            status: "PENDING_PAYMENT",
            paymentQrUrl: event.paymentQrImage,
            expiresAt,
            items: { createMany: { data: itemsData } },
          },
          select: { id: true, expiresAt: true, totalAmount: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const origin = new URL(request.url).origin;
    const { subject, html } = orderCreatedEmail(
      buyer.name,
      event.title,
      formatCurrency(Number(order.totalAmount)),
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
