import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { expireStaleOrders } from "@/lib/orders";
import { proofSubmittedEmail, sendEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const useBlobStorage = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Buyer uploads the bank-transfer receipt for their own order. Moves the
 * order to PAYMENT_SUBMITTED, which stops the 15-minute expiry; the proof
 * can be replaced while the organizer hasn't reviewed it yet.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("BUYER", "ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  await expireStaleOrders();

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      buyerId: true,
      status: true,
      totalAmount: true,
      buyer: { select: { name: true, email: true } },
      event: {
        select: {
          title: true,
          organizer: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!order || order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }
  if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_SUBMITTED") {
    return NextResponse.json(
      { error: "Este pedido ya no acepta comprobantes" },
      { status: 409 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No se recibió ningún archivo" },
      { status: 400 },
    );
  }

  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Formato no permitido. Usá JPG, PNG o WebP" },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "La imagen no puede superar los 5 MB" },
      { status: 400 },
    );
  }

  const fileName = `${randomUUID()}.${extension}`;
  let url: string;
  if (useBlobStorage) {
    const blob = await put(`proofs/${fileName}`, file, {
      access: "public",
      contentType: file.type,
    });
    url = blob.url;
  } else {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(
      path.join(UPLOAD_DIR, fileName),
      Buffer.from(await file.arrayBuffer()),
    );
    url = `/uploads/${fileName}`;
  }

  // Guard on status again so an expiry/confirmation that raced us can't be overwritten
  const updated = await prisma.order.updateMany({
    where: {
      id: order.id,
      status: { in: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED"] },
    },
    data: {
      paymentProof: url,
      paymentSubmittedAt: new Date(),
      status: "PAYMENT_SUBMITTED",
    },
  });
  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Este pedido ya no acepta comprobantes" },
      { status: 409 },
    );
  }

  // Notify the organizer on the first submission only — replacements while
  // already in review would just spam their inbox.
  if (order.status === "PENDING_PAYMENT") {
    const origin = new URL(request.url).origin;
    const { subject, html } = proofSubmittedEmail(
      order.event.organizer.name,
      order.buyer.name ?? order.buyer.email,
      order.event.title,
      formatCurrency(Number(order.totalAmount)),
      `${origin}/dashboard/orders`,
    );
    await sendEmail({ to: order.event.organizer.email, subject, html });
  }

  return NextResponse.json({ ok: true, url }, { status: 201 });
}
