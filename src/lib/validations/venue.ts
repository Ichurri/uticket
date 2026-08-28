import { z } from "zod";

/** A table inside a TABLES zone. Physical: capacity and position, no price. */
export const tableSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "La mesa necesita una etiqueta")
    .max(20, "La etiqueta es demasiado larga"),
  seats: z.coerce
    .number("La capacidad debe ser un número")
    .int()
    .min(1, "Una mesa admite al menos 1 persona")
    .max(50, "Máximo 50 personas por mesa"),
  /// A lounge sofa admits people without having chairs around it
  hasChairs: z.boolean().default(true),
  shape: z.enum(["ROUND", "SQUARE", "RECT"]).default("ROUND"),
  posX: z.coerce.number().int(),
  posY: z.coerce.number().int(),
  width: z.coerce.number().int().min(10).max(600).default(60),
  height: z.coerce.number().int().min(10).max(600).default(60),
  rotation: z.coerce.number().int().min(0).max(359).default(0),
});

/** A numbered seat inside a SEATED zone. */
export const seatSchema = z.object({
  row: z.string().trim().min(1).max(4),
  number: z.coerce.number().int().min(1).max(999),
  posX: z.coerce.number().int(),
  posY: z.coerce.number().int(),
});

const zoneObject = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la zona es obligatorio")
    .max(50, "El nombre de la zona es demasiado largo"),
  type: z.enum(["GENERAL", "TABLES", "SEATED"], "Tipo de zona inválido"),
  description: z
    .string()
    .max(300, "La descripción es demasiado larga")
    .nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .default("#6366f1"),
  order: z.coerce.number().int().min(0).default(0),
  /// Only meaningful for GENERAL — the other types derive it from the layout
  capacity: z.coerce
    .number("La capacidad debe ser un número")
    .int()
    .min(1, "La capacidad mínima es 1")
    .max(100000, "La capacidad es demasiado grande")
    .optional(),
  posX: z.coerce.number().int().default(0),
  posY: z.coerce.number().int().default(0),
  width: z.coerce.number().int().min(20).max(5000).default(200),
  height: z.coerce.number().int().min(20).max(5000).default(150),
  rotation: z.coerce.number().int().min(0).max(359).default(0),
  tables: z.array(tableSchema).max(200, "Máximo 200 mesas por zona").optional(),
  seats: z
    .array(seatSchema)
    .max(5000, "Máximo 5000 asientos por zona")
    .optional(),
});

/**
 * Shared by the create/replace path and by the layout editor: a zone has to
 * carry exactly the rows its type sells, with no repeated labels.
 */
const refineZone = (
  zone: {
    type: "GENERAL" | "TABLES" | "SEATED";
    capacity?: number;
    tables?: { label: string }[];
    seats?: { row: string; number: number }[];
  },
  ctx: z.RefinementCtx,
) => {
  if (zone.type === "GENERAL") {
    if (!zone.capacity) {
      ctx.addIssue({
        code: "custom",
        message: "Las zonas generales necesitan un aforo",
        path: ["capacity"],
      });
    }
    return;
  }

  if (zone.type === "TABLES") {
    const tables = zone.tables ?? [];
    if (tables.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Una zona de mesas necesita al menos una mesa",
        path: ["tables"],
      });
      return;
    }
    const labels = tables.map((table) => table.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({
        code: "custom",
        message: "Las mesas de una zona no pueden repetir etiqueta",
        path: ["tables"],
      });
    }
    return;
  }

  const seats = zone.seats ?? [];
  if (seats.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "Una zona de asientos numerados necesita al menos un asiento",
      path: ["seats"],
    });
    return;
  }
  const keys = seats.map((seat) => `${seat.row}-${seat.number}`);
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({
      code: "custom",
      message: "Hay asientos repetidos (misma fila y número)",
      path: ["seats"],
    });
  }
};

export const zoneSchema = zoneObject.superRefine(refineZone);

/**
 * The layout editor edits rows that already exist, so its payload carries the
 * database ids: the save is a diff (move/rename/add/remove), not a wipe and
 * recreate, which is what keeps an event's prices attached to its zones.
 */
const identified = { id: z.string().min(1).max(40).optional() };
export const layoutTableSchema = tableSchema.extend(identified);
export const layoutSeatSchema = seatSchema.extend(identified);
export const layoutZoneSchema = zoneObject
  .extend({
    ...identified,
    tables: z
      .array(layoutTableSchema)
      .max(200, "Máximo 200 mesas por zona")
      .optional(),
    seats: z
      .array(layoutSeatSchema)
      .max(5000, "Máximo 5000 asientos por zona")
      .optional(),
  })
  .superRefine(refineZone);

export const floorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El piso necesita un nombre")
    .max(50, "El nombre del piso es demasiado largo"),
  order: z.coerce.number().int().min(0).default(0),
  canvasWidth: z.coerce.number().int().min(200).max(10000).default(1000),
  canvasHeight: z.coerce.number().int().min(200).max(10000).default(700),
  backgroundImage: z.string().nullish(),
  zones: z.array(zoneSchema).max(40, "Máximo 40 zonas por piso").default([]),
});

export const venueSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre es demasiado largo"),
  description: z
    .string()
    .max(1000, "La descripción es demasiado larga")
    .nullish(),
  address: z
    .string()
    .trim()
    .min(3, "La dirección debe tener al menos 3 caracteres")
    .max(200, "La dirección es demasiado larga"),
  city: z
    .string()
    .trim()
    .min(2, "La ciudad debe tener al menos 2 caracteres")
    .max(50, "La ciudad es demasiado larga"),
  googleMapsUrl: z.string().max(500).nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  isPublic: z.boolean().default(false),
  /// Always at least one; the UI hides the concept when there is exactly one
  floors: z
    .array(floorSchema)
    .min(1, "Un venue necesita al menos un piso")
    .max(10, "Máximo 10 pisos"),
});

/** The layout editor saves one floor at a time (see the layout PUT route). */
export const floorLayoutSchema = z.object({
  name: floorSchema.shape.name.optional(),
  canvasWidth: floorSchema.shape.canvasWidth,
  canvasHeight: floorSchema.shape.canvasHeight,
  backgroundImage: z.string().nullish(),
  zones: z.array(layoutZoneSchema).max(40, "Máximo 40 zonas por piso"),
});

/** Adding a floor from the editor only needs a name. */
export const floorCreateSchema = z.object({
  name: floorSchema.shape.name,
  canvasWidth: floorSchema.shape.canvasWidth,
  canvasHeight: floorSchema.shape.canvasHeight,
});

export type VenueInput = z.input<typeof venueSchema>;
export type FloorInput = z.input<typeof floorSchema>;
export type ZoneInput = z.input<typeof zoneSchema>;
export type TableInput = z.input<typeof tableSchema>;
export type FloorLayoutInput = z.input<typeof floorLayoutSchema>;
export type LayoutZone = z.output<typeof layoutZoneSchema>;
export type LayoutTable = z.output<typeof layoutTableSchema>;
export type LayoutSeat = z.output<typeof layoutSeatSchema>;
