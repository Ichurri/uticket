import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { venueSchema } from "@/lib/validations/venue";
import { zoneCreateData } from "@/lib/venue-zones";
import { resolveVenueLocation } from "@/lib/venue-location";
import { findOwnVenue, venueHasSales } from "@/lib/venues";

type RouteContext = { params: Promise<{ id: string }> };

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

  const { floors, googleMapsUrl, latitude, longitude, ...data } = parsed.data;
  const location = await resolveVenueLocation({
    googleMapsUrl,
    latitude,
    longitude,
  });

  if (await venueHasSales(id)) {
    // Details are still editable; the layout is not.
    const venue = await prisma.venue.update({
      where: { id },
      data: { ...data, ...location },
      include: { floors: { include: { zones: true } } },
    });
    return NextResponse.json({
      venue,
      warning:
        "Este venue ya tiene ventas: se guardaron los datos pero no la distribución.",
    });
  }

  // Nothing sold yet: replace the whole floor/zone structure
  const [, venue] = await prisma.$transaction([
    prisma.floor.deleteMany({ where: { venueId: id } }),
    prisma.venue.update({
      where: { id },
      data: {
        ...data,
        ...location,
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
