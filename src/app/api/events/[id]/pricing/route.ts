import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { findOwnEvent } from "@/lib/events";
import { getEventInventory } from "@/lib/seats";
import { eventPricingSchema } from "@/lib/validations/pricing";
import { loadPricingZones, toPricingDto } from "@/lib/event-pricing";
import { boliviaLocalToUtc } from "@/lib/utils";

type RouteContext = { params: Promise<{ id: string }> };

/** Read the commercial setup of an event — what "copiar de otro evento" pulls. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const found = await findOwnEvent(id, session);
  if (found.response) return found.response;

  const zones = await loadPricingZones(id);
  return NextResponse.json({ zones: zones.map(toPricingDto) });
}

/**
 * Save the whole commercial setup in one go.
 *
 * Prices may change while an event is live — an early-bird that ends, a zone
 * that opens late. Orders already placed are unaffected: `OrderItem.unitPrice`
 * and `Ticket.priceAtPurchase` are snapshots taken at purchase.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id } = await params;
  const found = await findOwnEvent(id, session);
  if (found.response) return found.response;

  if (found.event.status === "CANCELLED") {
    return NextResponse.json(
      { error: "El evento está cancelado" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = eventPricingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const current = await loadPricingZones(id);
  const byId = new Map(current.map((zone) => [zone.id, zone]));

  const foreign = parsed.data.zones.filter((zone) => !byId.has(zone.eventZoneId));
  if (foreign.length > 0) {
    return NextResponse.json(
      { error: "Alguna zona no pertenece a este evento" },
      { status: 400 },
    );
  }

  const inventory = await getEventInventory(id);

  // ---- refuse what would contradict what is already sold -------------------
  const conflicts: string[] = [];
  for (const payload of parsed.data.zones) {
    const zone = byId.get(payload.eventZoneId)!;

    if (
      zone.zone.type === "TABLES" &&
      payload.tableSaleMode !== zone.tableSaleMode &&
      // BLOCKED is not "taken" — the organizer put it aside themselves and can
      // still change how the zone sells. Only a hold or a sale locks the mode.
      zone.eventTables.some(
        (table) =>
          table.status === "HELD" || table.status === "SOLD" || table.seatsSold > 0,
      )
    ) {
      conflicts.push(
        `${zone.zone.name}: no podés cambiar la forma de venta con mesas ya tomadas`,
      );
    }

    if (zone.zone.type === "GENERAL" && payload.capacityForSale !== undefined) {
      const taken = inventory.generalTaken.get(zone.id) ?? 0;
      if (payload.capacityForSale < taken) {
        conflicts.push(
          `${zone.zone.name}: ya vendiste ${taken} entradas, el aforo no puede bajar de ahí`,
        );
      }
    }
  }
  if (conflicts.length > 0) {
    return NextResponse.json(
      { error: conflicts[0], conflicts },
      { status: 409 },
    );
  }

  // A table that is held or sold keeps its status: the payload was built
  // before that happened, and honouring it would put a sold table back on
  // sale. Its prices still update — those only affect the next buyer.
  const skipped: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const payload of parsed.data.zones) {
      const zone = byId.get(payload.eventZoneId)!;

      await tx.eventZone.update({
        where: { id: zone.id },
        data: {
          price: payload.price,
          isEnabled: payload.isEnabled,
          capacityForSale:
            zone.zone.type === "GENERAL" ? (payload.capacityForSale ?? null) : null,
          tableSaleMode: payload.tableSaleMode,
          seatPrice: payload.seatPrice ?? null,
          defaultInclusionType: payload.defaultInclusionType,
          defaultInclusionValue: payload.defaultInclusionValue ?? null,
          defaultInclusionNote: payload.defaultInclusionNote ?? null,
          salesStartAt: payload.salesStartAt
            ? boliviaLocalToUtc(payload.salesStartAt)
            : null,
          salesEndAt: payload.salesEndAt
            ? boliviaLocalToUtc(payload.salesEndAt)
            : null,
        },
      });

      const tables = new Map(zone.eventTables.map((table) => [table.id, table]));
      for (const table of payload.tables) {
        const existing = tables.get(table.eventTableId);
        if (!existing) continue;

        const locked = existing.status === "HELD" || existing.status === "SOLD";
        if (locked && table.blocked) {
          skipped.push(existing.table.label);
        }

        await tx.eventTable.update({
          where: { id: existing.id },
          data: {
            price: table.price ?? null,
            seatPrice: table.seatPrice ?? null,
            inclusionType: table.inclusionType ?? null,
            inclusionValue: table.inclusionValue ?? null,
            inclusionNote: table.inclusionNote ?? null,
            ...(locked
              ? {}
              : { status: table.blocked ? "BLOCKED" : "AVAILABLE" }),
          },
        });
      }
    }
  });

  const zones = await loadPricingZones(id);
  return NextResponse.json({
    zones: zones.map(toPricingDto),
    skipped,
  });
}
