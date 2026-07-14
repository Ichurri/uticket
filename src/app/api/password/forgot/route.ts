import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import {
  hasRecentPasswordResetToken,
  sendPasswordResetEmail,
} from "@/lib/verification";

/**
 * Always responds 200 with the same message so the endpoint can't be used
 * to probe which emails are registered.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { name: true, email: true, password: true },
  });

  // Google-only accounts have no password to reset; they sign in with Google
  // Cooldown is silent: a 429 here would reveal which emails are registered.
  if (user?.password && !(await hasRecentPasswordResetToken(user.email))) {
    await sendPasswordResetEmail(
      { name: user.name, email: user.email },
      new URL(request.url).origin,
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.",
  });
}
