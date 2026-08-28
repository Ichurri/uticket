import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currencyFormatter = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  minimumFractionDigits: 2,
});

export function formatCurrency(amount: number | string) {
  return currencyFormatter.format(Number(amount));
}

/** Short human-friendly order reference for the mono "ORD-XXXXXX" tag —
 * the id itself is a cuid, not meant to be read aloud in full. */
export function orderReference(id: string) {
  return id.slice(-6).toUpperCase();
}

/** Stored at noon UTC so the calendar date is stable in any nearby timezone. */
export function eventDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

/**
 * Real start instant of an event: calendar date (noon-UTC `date`) plus the
 * `time` string ("HH:MM") in Bolivia time (fixed UTC-4, no DST).
 */
export function eventStartsAt(event: { date: Date; time: string }) {
  const day = event.date.toISOString().slice(0, 10);
  return new Date(`${day}T${event.time}:00-04:00`);
}

/** Orders close `cutoffHours` before the event starts (platform setting). */
export function salesAreClosed(
  event: { date: Date; time: string },
  cutoffHours: number,
) {
  return Date.now() > eventStartsAt(event).getTime() - cutoffHours * 3_600_000;
}

/**
 * "2026-10-15T20:30" as typed into a `datetime-local` input, read as Bolivia
 * time. The organizer types the hour on their own clock; the server may well
 * be in UTC, so the offset is pinned rather than inferred.
 */
export function boliviaLocalToUtc(value: string) {
  return new Date(`${value}:00-04:00`);
}

/** The reverse: a stored instant back into what `datetime-local` expects. */
export function utcToBoliviaLocal(date: Date | string) {
  const instant = typeof date === "string" ? new Date(date) : date;
  return new Date(instant.getTime() - 4 * 3_600_000).toISOString().slice(0, 16);
}

/** All user-facing times are Bolivia time (fixed UTC-4) regardless of where
 * the server runs — Vercel renders in UTC, so formatters must pin this. */
export const BOLIVIA_TZ = "America/La_Paz";

const dateFormatter = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "long",
  timeZone: BOLIVIA_TZ,
});

export function formatDate(date: Date | string) {
  return dateFormatter.format(new Date(date));
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: BOLIVIA_TZ,
});

export function formatDateTime(date: Date | string) {
  return dateTimeFormatter.format(new Date(date));
}

const shortDateFormatter = new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  timeZone: BOLIVIA_TZ,
});

/** Compact "22 ago" date, for dense table/list rows. */
export function formatShortDate(date: Date | string) {
  return shortDateFormatter.format(new Date(date)).replace(/\.$/, "");
}

const weekdayDateFormatter = new Intl.DateTimeFormat("es-BO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: BOLIVIA_TZ,
});

/** Compact "Sáb 22 ago" date, for dense cards with a leading weekday. */
export function formatWeekdayDate(date: Date | string) {
  const formatted = weekdayDateFormatter
    .format(new Date(date))
    .replace(",", "")
    .replace(/\.$/, "");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
