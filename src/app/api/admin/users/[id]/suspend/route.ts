import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

const suspendSchema = z.object({
  suspended: z.boolean(),
});

export async function POST(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ADMIN");
  if (error) return error;

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json(
      { error: "No podés suspender tu propia cuenta" },
      { status: 409 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }
  if (user.role === "ADMIN") {
    return NextResponse.json(
      { error: "No se pueden suspender cuentas de administrador" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = suspendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { suspended: parsed.data.suspended },
    select: { id: true, suspended: true },
  });

  return NextResponse.json({ user: updated });
}
