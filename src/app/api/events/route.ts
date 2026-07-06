import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { eventSchema } from "@/lib/validations/event";
import { eventDate } from "@/lib/utils";

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

  const { venueId, date, ...data } = parsed.data;

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue || (venue.organizerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json(
      { error: "El venue elegido no existe o no te pertenece" },
      { status: 400 },
    );
  }

  const event = await prisma.event.create({
    data: {
      ...data,
      date: eventDate(date),
      venueId,
      organizerId: session.user.id,
    },
  });

  return NextResponse.json({ event }, { status: 201 });
}
