import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { floorCreateSchema } from "@/lib/validations/venue";
import { findOwnVenue } from "@/lib/venues";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_FLOORS = 10;

export async function POST(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const found = await findOwnVenue(id, session);
  if (found.response) return found.response;

  const body = await request.json().catch(() => null);
  const parsed = floorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const floors = await prisma.floor.count({ where: { venueId: id } });
  if (floors >= MAX_FLOORS) {
    return NextResponse.json(
      { error: `Un venue puede tener hasta ${MAX_FLOORS} pisos` },
      { status: 409 },
    );
  }

  const taken = await prisma.floor.findFirst({
    where: { venueId: id, name: parsed.data.name },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: "Ya hay un piso con ese nombre" },
      { status: 409 },
    );
  }

  const floor = await prisma.floor.create({
    data: { ...parsed.data, venueId: id, order: floors },
  });

  return NextResponse.json({ floor }, { status: 201 });
}
