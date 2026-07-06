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

/** Stored at noon UTC so the calendar date is stable in any nearby timezone. */
export function eventDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

const dateFormatter = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "long",
});

export function formatDate(date: Date | string) {
  return dateFormatter.format(new Date(date));
}
