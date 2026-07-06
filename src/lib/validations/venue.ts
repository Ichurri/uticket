import { z } from "zod";

export const zoneSchema = z
  .object({
    name: z
      .string()
      .min(1, "El nombre de la zona es obligatorio")
      .max(50, "El nombre de la zona es demasiado largo"),
    priceMultiplier: z.coerce
      .number("El multiplicador debe ser un número")
      .min(0.1, "El multiplicador mínimo es 0.1")
      .max(99, "El multiplicador máximo es 99"),
    numbered: z.boolean(),
    capacity: z.coerce
      .number("La capacidad debe ser un número")
      .int()
      .min(1, "La capacidad mínima es 1")
      .max(100000, "La capacidad es demasiado grande")
      .optional(),
    rows: z.coerce
      .number("Las filas deben ser un número")
      .int()
      .min(1, "Mínimo 1 fila")
      .max(26, "Máximo 26 filas (A-Z)")
      .optional(),
    seatsPerRow: z.coerce
      .number("Los asientos por fila deben ser un número")
      .int()
      .min(1, "Mínimo 1 asiento por fila")
      .max(60, "Máximo 60 asientos por fila")
      .optional(),
  })
  .superRefine((zone, ctx) => {
    if (zone.numbered) {
      if (!zone.rows || !zone.seatsPerRow) {
        ctx.addIssue({
          code: "custom",
          message:
            "Las zonas numeradas necesitan filas y asientos por fila",
          path: ["rows"],
        });
      }
    } else if (!zone.capacity) {
      ctx.addIssue({
        code: "custom",
        message: "Las zonas sin numerar necesitan una capacidad",
        path: ["capacity"],
      });
    }
  });

export const venueSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre es demasiado largo"),
  address: z
    .string()
    .min(3, "La dirección debe tener al menos 3 caracteres")
    .max(200, "La dirección es demasiado larga"),
  city: z
    .string()
    .min(2, "La ciudad debe tener al menos 2 caracteres")
    .max(50, "La ciudad es demasiado larga"),
  zones: z
    .array(zoneSchema)
    .min(1, "Definí al menos una zona")
    .max(20, "Máximo 20 zonas"),
});

export type VenueInput = z.input<typeof venueSchema>;
export type ZoneInput = z.input<typeof zoneSchema>;
