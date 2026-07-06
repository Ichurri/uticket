import { z } from "zod";

export const createOrderSchema = z
  .object({
    eventId: z.string().min(1, "Falta el evento"),
    seatIds: z.array(z.string().min(1)).max(20, "Demasiados asientos").default([]),
    zones: z
      .array(
        z.object({
          zoneId: z.string().min(1),
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
    (data) => data.seatIds.length + data.zones.length > 0,
    "El pedido está vacío",
  );

export type CreateOrderInput = z.input<typeof createOrderSchema>;
