import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { venueSchema } from "@/lib/validations/venue";
import { zoneCreateData } from "@/lib/venue-zones";
import { resolveVenueLocation } from "@/lib/venue-location";

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

  const { floors, googleMapsUrl, latitude, longitude, ...data } = parsed.data;
  // The link is kept verbatim for the "Cómo llegar" button; the coordinates
  // are best-effort and never block the save.
  const location = await resolveVenueLocation({
    googleMapsUrl,
    latitude,
    longitude,
  });

  const venue = await prisma.venue.create({
    data: {
      ...data,
      ...location,
      ownerId: session.user.id,
      floors: {
        create: floors.map((floor, index) => ({
          name: floor.name,
          order: floor.order ?? index,
          canvasWidth: floor.canvasWidth,
          canvasHeight: floor.canvasHeight,
          backgroundImage: floor.backgroundImage ?? null,
          zones: { create: floor.zones.map(zoneCreateData) },
        })),
      },
    },
    include: { floors: { include: { zones: true } } },
  });

  return NextResponse.json({ venue }, { status: 201 });
}
