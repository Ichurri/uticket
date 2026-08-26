import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { eventReviewedEmail, sendEmail } from "@/lib/email";

type RouteContext = { params: Promise<{ id: string }> };

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"], "Acción inválida"),
  /** Why it bounced. The organizer used to get their event sent back to
   * draft with no explanation at all. */
  reason: z.string().trim().max(300).optional(),
});

export async function POST(request: Request, { params }: RouteContext) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: { organizer: { select: { name: true, email: true } } },
  });
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

  const approved = parsed.data.action === "approve";

  // Rejection returns the event to DRAFT so the organizer can fix and resubmit
  const claimed = await prisma.event.updateMany({
    where: { id, status: "PENDING" },
    data: { status: approved ? "APPROVED" : "DRAFT" },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "Solo se pueden revisar eventos pendientes" },
      { status: 409 },
    );
  }

  const origin = new URL(request.url).origin;
  const { subject, html } = eventReviewedEmail(
    event.organizer.name,
    event.title,
    approved,
    parsed.data.reason ?? null,
    approved
      ? `${origin}/events/${id}`
      : `${origin}/dashboard/events/${id}/edit`,
  );
  const emailResult = await sendEmail({
    to: event.organizer.email,
    subject,
    html,
  });
  if (!emailResult.ok) {
    console.error(`[email] review email failed for event ${id}`);
  }

  return NextResponse.json({
    event: { ...event, status: approved ? "APPROVED" : "DRAFT" },
    emailSent: emailResult.ok,
  });
}
