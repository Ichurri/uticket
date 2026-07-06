import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { eventStatusActionSchema } from "@/lib/validations/event";

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
    return NextResponse.json({ event: updated });
  }

  // action === "cancel"
  if (event.status !== "PENDING" && event.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Este evento no se puede cancelar" },
      { status: 409 },
    );
  }
  const updated = await prisma.event.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  return NextResponse.json({ event: updated });
}
