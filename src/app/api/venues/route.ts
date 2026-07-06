import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { venueSchema } from "@/lib/validations/venue";
import {
  seatMapTypeFor,
  venueCapacity,
  zoneCreateData,
} from "@/lib/venue-zones";

export async function POST(request: Request) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = venueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { name, address, city, zones } = parsed.data;

  const venue = await prisma.venue.create({
    data: {
      name,
      address,
      city,
      capacity: venueCapacity(zones),
      seatMapType: seatMapTypeFor(zones),
      organizerId: session.user.id,
      zones: { create: zoneCreateData(zones) },
    },
    include: { zones: true },
  });

  return NextResponse.json({ venue }, { status: 201 });
}
