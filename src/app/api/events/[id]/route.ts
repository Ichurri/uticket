import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { eventSchema } from "@/lib/validations/event";
import { eventDate } from "@/lib/utils";
import { syncEventZones } from "@/lib/event-zones";
import { findOwnEvent } from "@/lib/events";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const found = await findOwnEvent(id, session);
  if (found.response) return found.response;

  if (found.event.status !== "DRAFT" && found.event.status !== "PENDING") {
    return NextResponse.json(
      { error: "Solo se pueden editar eventos en borrador o en revisión" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { venueId, date, basePrice, ...data } = parsed.data;

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (
    !venue ||
    (venue.ownerId !== session.user.id &&
      !venue.isPublic &&
      session.user.role !== "ADMIN")
  ) {
    return NextResponse.json(
      { error: "El venue elegido no existe o no te pertenece" },
      { status: 400 },
    );
  }

  const event = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id },
      data: { ...data, date: eventDate(date), venueId },
    });
    // Moving to another venue puts that venue's zones on sale too; zones the
    // organizer already priced are left alone.
    await syncEventZones(tx, { eventId: id, venueId, basePrice });
    return updated;
  });

  return NextResponse.json({ event });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const found = await findOwnEvent(id, session);
  if (found.response) return found.response;

  if (found.event.status === "APPROVED") {
    return NextResponse.json(
      { error: "No podés eliminar un evento aprobado; cancelalo primero" },
      { status: 409 },
    );
  }

  const orderCount = await prisma.order.count({ where: { eventId: id } });
  if (orderCount > 0) {
    return NextResponse.json(
      { error: "No podés eliminar un evento con órdenes registradas" },
      { status: 409 },
    );
  }

  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
