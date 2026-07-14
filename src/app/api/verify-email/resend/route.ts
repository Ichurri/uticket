import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import {
  hasRecentVerificationToken,
  sendVerificationEmail,
} from "@/lib/verification";

export async function POST(request: Request) {
  const { session, error } = await requireRole("BUYER", "ORGANIZER", "ADMIN");
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, emailVerified: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }
  if (user.emailVerified) {
    return NextResponse.json(
      { error: "Tu correo ya está verificado" },
      { status: 409 },
    );
  }

  if (await hasRecentVerificationToken(user.email)) {
    return NextResponse.json(
      { error: "Ya te enviamos un correo hace un momento. Esperá un minuto e intentá de nuevo." },
      { status: 429 },
    );
  }

  await sendVerificationEmail(
    { name: user.name, email: user.email },
    new URL(request.url).origin,
  );

  return NextResponse.json({ ok: true });
}
