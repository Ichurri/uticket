import type { EventStatus, OrderStatus } from "@/generated/prisma/enums";

export const EVENT_CATEGORIES = [
  "Comedia",
  "Música",
  "Teatro",
  "Danza",
  "Festival",
  "Deportes",
  "Otro",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_EMOJIS: Record<string, string> = {
  Comedia: "🎤",
  Música: "🎵",
  Teatro: "🎭",
  Danza: "💃",
  Festival: "🎪",
  Deportes: "⚽",
  Otro: "🎟️",
};

export const EVENT_STATUS_LABELS: Record<
  EventStatus,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  DRAFT: { label: "Borrador", variant: "default" },
  PENDING: { label: "En revisión", variant: "warning" },
  APPROVED: { label: "Aprobado", variant: "success" },
  CANCELLED: { label: "Cancelado", variant: "danger" },
};

export const ORDER_STATUS_LABELS: Record<
  OrderStatus,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  PENDING_PAYMENT: { label: "Esperando pago", variant: "warning" },
  CONFIRMED: { label: "Confirmado", variant: "success" },
  CANCELLED: { label: "Cancelado", variant: "danger" },
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
