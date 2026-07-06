import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"], "Acción inválida"),
});

export async function POST(request: Request, { params }: RouteContext) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (event.status !== "PENDING") {
    return NextResponse.json(
      { error: "Solo se pueden revisar eventos pendientes" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }

  // Rejection returns the event to DRAFT so the organizer can fix and resubmit
  const updated = await prisma.event.update({
    where: { id },
    data: { status: parsed.data.action === "approve" ? "APPROVED" : "DRAFT" },
  });

  return NextResponse.json({ event: updated });
}
