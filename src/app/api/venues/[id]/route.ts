import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, type AuthedSession } from "@/lib/api-auth";
import { venueSchema } from "@/lib/validations/venue";
import {
  seatMapTypeFor,
  venueCapacity,
  zoneCreateData,
} from "@/lib/venue-zones";

type RouteContext = { params: Promise<{ id: string }> };

async function findOwnVenue(id: string, session: AuthedSession) {
  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) return { response: NextResponse.json({ error: "Venue no encontrado" }, { status: 404 }) };
  if (venue.organizerId !== session.user.id && session.user.role !== "ADMIN") {
    return { response: NextResponse.json({ error: "No tenés permisos sobre este venue" }, { status: 403 }) };
  }
  return { venue };
}

/** A venue is "locked" once any of its zones/seats appear in orders or tickets. */
async function venueHasSales(venueId: string) {
  const [orderItems, tickets] = await Promise.all([
    prisma.orderItem.count({
      where: {
        OR: [{ zone: { venueId } }, { seat: { zone: { venueId } } }],
      },
    }),
    prisma.ticket.count({
      where: {
        OR: [{ zone: { venueId } }, { seat: { zone: { venueId } } }],
      },
    }),
  ]);
  return orderItems + tickets > 0;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const found = await findOwnVenue(id, session);
  if (found.response) return found.response;

  const body = await request.json().catch(() => null);
  const parsed = venueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (await venueHasSales(id)) {
    return NextResponse.json(
      {
        error:
          "Este venue ya tiene ventas registradas y su estructura no puede modificarse",
      },
      { status: 409 },
    );
  }

  const { name, address, city, zones } = parsed.data;

  // No sales yet: replace the zone/seat structure wholesale
  const [, venue] = await prisma.$transaction([
    prisma.zone.deleteMany({ where: { venueId: id } }),
    prisma.venue.update({
      where: { id },
      data: {
        name,
        address,
        city,
        capacity: venueCapacity(zones),
        seatMapType: seatMapTypeFor(zones),
        zones: { create: zoneCreateData(zones) },
      },
      include: { zones: true },
    }),
  ]);

  return NextResponse.json({ venue });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const found = await findOwnVenue(id, session);
  if (found.response) return found.response;

  const eventCount = await prisma.event.count({ where: { venueId: id } });
  if (eventCount > 0) {
    return NextResponse.json(
      { error: "No podés eliminar un venue con eventos asociados" },
      { status: 409 },
    );
  }

  await prisma.venue.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
