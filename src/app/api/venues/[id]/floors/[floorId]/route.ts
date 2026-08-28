import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { findOwnVenue, piecesWithSales } from "@/lib/venues";

type RouteContext = { params: Promise<{ id: string; floorId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id, floorId } = await params;
  const found = await findOwnVenue(id, session);
  if (found.response) return found.response;

  const floor = await prisma.floor.findFirst({
    where: { id: floorId, venueId: id },
    include: { zones: { select: { id: true } } },
  });
  if (!floor) {
    return NextResponse.json({ error: "Piso no encontrado" }, { status: 404 });
  }

  // A venue always has at least one floor, even when the UI hides the concept
  const total = await prisma.floor.count({ where: { venueId: id } });
  if (total <= 1) {
    return NextResponse.json(
      { error: "Un venue necesita al menos un piso" },
      { status: 409 },
    );
  }

  const zoneIds = floor.zones.map((zone) => zone.id);
  const sold = await piecesWithSales({ zoneIds });
  if (sold.zones.size > 0) {
    return NextResponse.json(
      { error: "Este piso tiene zonas con ventas y no se puede borrar" },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.eventZone.deleteMany({ where: { zoneId: { in: zoneIds } } }),
    prisma.floor.delete({ where: { id: floorId } }),
  ]);

  return NextResponse.json({ ok: true });
}
