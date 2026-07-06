import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";
import type { Session } from "next-auth";

export type AuthedSession = Session & { user: NonNullable<Session["user"]> };

type RequireRoleResult =
  | { session: AuthedSession; error?: never }
  | { session?: never; error: NextResponse };

/**
 * Returns the session when the current user has one of the given roles,
 * or a ready-to-return NextResponse (401/403) when they don't.
 */
export async function requireRole(...roles: Role[]): Promise<RequireRoleResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!roles.includes(session.user.role)) {
    return {
      error: NextResponse.json(
        { error: "No tenés permisos para esta acción" },
        { status: 403 },
      ),
    };
  }

  // JWT sessions outlive an account suspension, so recheck against the DB
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { suspended: true },
  });
  if (!dbUser || dbUser.suspended) {
    return {
      error: NextResponse.json(
        { error: "Tu cuenta está suspendida" },
        { status: 403 },
      ),
    };
  }

  return { session: session as AuthedSession };
}
