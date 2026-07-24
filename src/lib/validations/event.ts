import { z } from "zod";

const LOCAL_UPLOAD_PATTERN = /^\/uploads\/[\w.-]+$/;
const BLOB_UPLOAD_PATTERN =
  /^https:\/\/[\w-]+\.public\.blob\.vercel-storage\.com\/[\w./-]+$/;

const uploadPath = z
  .string()
  .refine(
    (value) =>
      LOCAL_UPLOAD_PATTERN.test(value) || BLOB_UPLOAD_PATTERN.test(value),
    "Ruta de imagen inválida",
  )
  .nullable()
  .optional();

export const eventSchema = z.object({
  title: z
    .string()
    .min(3, "El título debe tener al menos 3 caracteres")
    .max(120, "El título es demasiado largo"),
  description: z
    .string()
    .min(10, "La descripción debe tener al menos 10 caracteres")
    .max(5000, "La descripción es demasiado larga"),
  category: z
    .string()
    .trim()
    .min(1, "Elegí o escribí una categoría")
    .max(40, "La categoría es demasiado larga"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha válida"),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Elegí una hora válida"),
  venueId: z.string().min(1, "Elegí un venue"),
  price: z.coerce
    .number("El precio debe ser un número")
    .positive("El precio debe ser mayor a 0")
    .max(100000, "El precio es demasiado alto"),
  coverImage: uploadPath,
  paymentQrImage: uploadPath,
});

export const eventStatusActionSchema = z.object({
  action: z.enum(["submit", "cancel"], "Acción inválida"),
});

export type EventInput = z.input<typeof eventSchema>;
