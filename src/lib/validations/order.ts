import { z } from "zod";

export const createOrderSchema = z
  .object({
    eventId: z.string().min(1, "Falta el evento"),
    /// Physical seat ids in SEATED zones — the EventSeat row is created lazily
    seatIds: z.array(z.string().min(1)).max(20, "Demasiados asientos").default([]),
    tables: z
      .array(
        z.object({
          eventTableId: z.string().min(1),
          /// Spots inside the table; omitted means the whole table
          seats: z
            .number()
            .int()
            .min(1, "Mínimo 1 lugar")
            .max(50, "Demasiados lugares")
            .optional(),
        }),
      )
      .max(5, "Máximo 5 mesas por pedido")
      .default([]),
    zones: z
      .array(
        z.object({
          eventZoneId: z.string().min(1),
          quantity: z
            .number()
            .int()
            .min(1, "Cantidad mínima 1")
            .max(10, "Máximo 10 boletos por zona"),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine(
    (data) =>
      data.seatIds.length + data.tables.length + data.zones.length > 0,
    "El pedido está vacío",
  );

export type CreateOrderInput = z.input<typeof createOrderSchema>;
