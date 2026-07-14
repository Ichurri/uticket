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
  {
    label: string;
    variant: "default" | "success" | "warning" | "danger" | "primary";
  }
> = {
  PENDING_PAYMENT: { label: "Esperando pago", variant: "warning" },
  PAYMENT_SUBMITTED: { label: "En revisión", variant: "primary" },
  CONFIRMED: { label: "Confirmado", variant: "success" },
  CANCELLED: { label: "Cancelado", variant: "danger" },
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** A buyer may hold at most this many unpaid (PENDING_PAYMENT) orders at
 * once, so nobody can lock up an event's inventory in 15-minute cycles. */
export const MAX_PENDING_ORDERS_PER_BUYER = 3;
