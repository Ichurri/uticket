import { z } from "zod";

/**
 * What the pricing screen sends. This is the commercial layer and only the
 * commercial layer: prices, what is on sale, what a table includes. Nothing
 * here can move a wall — the geometry lives in the venue's plan.
 */

const money = z.coerce
  .number("El precio debe ser un número")
  .min(0.01, "El precio debe ser mayor a 0")
  .max(100000, "El precio es demasiado alto");

/** An override that may be left empty to fall back to the zone. */
const optionalMoney = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  money.optional(),
);

const inclusionType = z.enum([
  "NONE",
  "ENTRY_ONLY",
  "CONSUMPTION_CREDIT",
  "BOTTLE",
  "CUSTOM",
]);

const inclusionNote = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().max(200, "La nota es demasiado larga").optional(),
);

/** `datetime-local` gives "YYYY-MM-DDTHH:MM"; empty means no limit. */
const localDateTime = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora inválidas")
    .optional(),
);

export const eventTablePricingSchema = z.object({
  eventTableId: z.string().min(1),
  price: optionalMoney,
  seatPrice: optionalMoney,
  inclusionType: inclusionType.optional(),
  inclusionValue: optionalMoney,
  inclusionNote,
  /** Off sale for this event without touching the plan */
  blocked: z.boolean().default(false),
});

export const eventZonePricingSchema = z
  .object({
    eventZoneId: z.string().min(1),
    price: money,
    isEnabled: z.boolean().default(true),
    /** GENERAL only: stock held back. Empty means "the whole zone". */
    capacityForSale: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce
        .number("El aforo debe ser un número")
        .int()
        .min(1, "El aforo mínimo es 1")
        .max(100000, "El aforo es demasiado grande")
        .optional(),
    ),
    tableSaleMode: z.enum(["WHOLE_TABLE", "PER_SEAT"]).default("WHOLE_TABLE"),
    seatPrice: optionalMoney,
    defaultInclusionType: inclusionType.default("NONE"),
    defaultInclusionValue: optionalMoney,
    defaultInclusionNote: inclusionNote,
    salesStartAt: localDateTime,
    salesEndAt: localDateTime,
    tables: z
      .array(eventTablePricingSchema)
      .max(200, "Máximo 200 mesas por zona")
      .default([]),
  })
  .superRefine((zone, ctx) => {
    if (zone.tableSaleMode === "PER_SEAT" && zone.seatPrice === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Vender por lugar necesita un precio por lugar",
        path: ["seatPrice"],
      });
    }
    if (
      zone.defaultInclusionType === "CONSUMPTION_CREDIT" &&
      zone.defaultInclusionValue === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Un consumo incluido necesita un monto",
        path: ["defaultInclusionValue"],
      });
    }
    if (
      zone.salesStartAt &&
      zone.salesEndAt &&
      zone.salesEndAt <= zone.salesStartAt
    ) {
      ctx.addIssue({
        code: "custom",
        message: "La venta no puede cerrar antes de abrir",
        path: ["salesEndAt"],
      });
    }
    for (const [index, table] of zone.tables.entries()) {
      if (
        table.inclusionType === "CONSUMPTION_CREDIT" &&
        table.inclusionValue === undefined
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Un consumo incluido necesita un monto",
          path: ["tables", index, "inclusionValue"],
        });
      }
    }
  });

export const eventPricingSchema = z.object({
  zones: z
    .array(eventZonePricingSchema)
    .min(1, "El evento no tiene zonas para configurar")
    .max(40, "Demasiadas zonas"),
});

export type EventPricingInput = z.input<typeof eventPricingSchema>;
export type ZonePricingInput = z.input<typeof eventZonePricingSchema>;
export type TablePricingInput = z.input<typeof eventTablePricingSchema>;
