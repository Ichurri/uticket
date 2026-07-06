import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("BUYER", "ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { select: { seatId: true } },
      event: { select: { organizerId: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const isBuyer = order.buyerId === session.user.id;
  const isOrganizer = order.event.organizerId === session.user.id;
  if (!isBuyer && !isOrganizer && session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "No tenés permisos sobre este pedido" },
      { status: 403 },
    );
  }
  if (order.status !== "PENDING_PAYMENT") {
    return NextResponse.json(
      { error: "Solo se pueden cancelar pedidos pendientes de pago" },
      { status: 409 },
    );
  }

  const seatIds = order.items
    .map((item) => item.seatId)
    .filter((seatId): seatId is string => seatId !== null);

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    }),
    prisma.seat.updateMany({
      where: { id: { in: seatIds }, status: "RESERVED" },
      data: { status: "AVAILABLE" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
