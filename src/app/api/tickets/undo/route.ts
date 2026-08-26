import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { verifyTicketSchema } from "@/lib/validations/ticket";

/**
 * Door staff mis-scan: someone in the wrong group, a double tap, a phone
 * held over the reader twice. Check-in is otherwise irreversible, which
 * means the person can't get in and nobody on site can fix it.
 *
 * Deliberately narrow: only the check-in that JUST happened can be undone,
 * so this can't be used to recycle a ticket later in the night.
 */
export const UNDO_WINDOW_MS = 2 * 60_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifyTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "El código no es un boleto válido" },
      { status: 400 },
    );
  }

  // Same credentials as /verify: an event's door code, or an organizer/admin
  // session. Whoever can check a ticket in can undo it.
  let scanEventId: string | null = null;
  let sessionUserId: string | null = null;
  let isAdmin = false;

  if (parsed.data.scanCode) {
    const scanEvent = await prisma.event.findUnique({
      where: { scanCode: parsed.data.scanCode },
      select: { id: true },
    });
    if (!scanEvent) {
      return NextResponse.json(
        { error: "El código de acceso de puerta no es válido" },
        { status: 403 },
      );
    }
    scanEventId = scanEvent.id;
  } else {
    const { session, error } = await requireRole("ORGANIZER", "ADMIN");
    if (error) return error;
    sessionUserId = session.user.id;
    isAdmin = session.user.role === "ADMIN";
  }

  const ticket = await prisma.ticket.findUnique({
    where: { code: parsed.data.code },
    select: {
      id: true,
      eventId: true,
      status: true,
      usedAt: true,
      event: { select: { organizerId: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Este boleto no existe" }, { status: 404 });
  }

  const allowed = scanEventId
    ? ticket.eventId === scanEventId
    : isAdmin || ticket.event.organizerId === sessionUserId;
  if (!allowed) {
    return NextResponse.json(
      { error: "Este boleto pertenece a otro evento" },
      { status: 403 },
    );
  }

  if (ticket.status !== "USED" || !ticket.usedAt) {
    return NextResponse.json(
      { error: "Este boleto no está marcado como usado" },
      { status: 409 },
    );
  }
  if (Date.now() - ticket.usedAt.getTime() > UNDO_WINDOW_MS) {
    return NextResponse.json(
      {
        error:
          "Ya pasó la ventana para deshacer este ingreso. Pedile ayuda al organizador.",
      },
      { status: 409 },
    );
  }

  // Guarded like every other status flip: two staff undoing at once is a
  // no-op for the second one rather than a double revert.
  const reverted = await prisma.ticket.updateMany({
    where: { id: ticket.id, status: "USED" },
    data: { status: "VALID", usedAt: null },
  });
  if (reverted.count === 0) {
    return NextResponse.json(
      { error: "Este boleto no está marcado como usado" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
