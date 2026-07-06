import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { requireRole } from "@/lib/api-auth";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(request: Request) {
  const { error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

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
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(
    path.join(UPLOAD_DIR, fileName),
    Buffer.from(await file.arrayBuffer()),
  );

  return NextResponse.json({ url: `/uploads/${fileName}` }, { status: 201 });
}
