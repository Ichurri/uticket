import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { eventSchema } from "@/lib/validations/event";
import { eventDate } from "@/lib/utils";
import { syncEventZones } from "@/lib/event-zones";

export async function POST(request: Request) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

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

  // Creating the event also puts the venue's zones on sale at the base price;
  // the organizer refines each one in /dashboard/events/[id]/pricing.
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        ...data,
        date: eventDate(date),
        venueId,
        organizerId: session.user.id,
      },
    });
    await syncEventZones(tx, { eventId: created.id, venueId, basePrice });
    return created;
  });

  return NextResponse.json({ event }, { status: 201 });
}
