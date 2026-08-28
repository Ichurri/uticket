import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { floorLayoutSchema } from "@/lib/validations/venue";
import { findOwnVenue, piecesWithSales } from "@/lib/venues";
import { syncZoneTables } from "@/lib/event-zones";

type RouteContext = { params: Promise<{ id: string; floorId: string }> };

/**
 * Save one floor of the plan.
 *
 * This is a DIFF, not a wipe and recreate: every row the editor already knows
 * comes back with its id, so a zone keeps its identity across a save and the
 * EventZone rows hanging off it — the prices an organizer already set — stay
 * attached. Only what the editor dropped is deleted, and only if nothing was
 * ever sold against it.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const { session, error } = await requireRole("ORGANIZER", "ADMIN");
  if (error) return error;

  const { id, floorId } = await params;
  const found = await findOwnVenue(id, session);
  if (found.response) return found.response;

  const floor = await prisma.floor.findFirst({
    where: { id: floorId, venueId: id },
    include: {
      zones: {
        include: {
          tables: { select: { id: true, label: true } },
          seats: { select: { id: true, row: true, number: true } },
        },
      },
    },
  });
  if (!floor) {
    return NextResponse.json({ error: "Piso no encontrado" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = floorLayoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Plano inválido", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // ---- what the editor dropped -------------------------------------------
  const payloadZones = new Map(
    payload.zones.filter((zone) => zone.id).map((zone) => [zone.id!, zone]),
  );
  const removedZones = floor.zones.filter((zone) => !payloadZones.has(zone.id));
  const removedTables: { id: string; label: string }[] = [];
  const removedSeats: { id: string; label: string }[] = [];

  for (const zone of floor.zones) {
    const kept = payloadZones.get(zone.id);
    const keptTables = new Set(
      (kept?.tables ?? []).map((table) => table.id).filter(Boolean),
    );
    const keptSeats = new Set(
      (kept?.seats ?? []).map((seat) => seat.id).filter(Boolean),
    );
    for (const table of zone.tables) {
      if (!kept || !keptTables.has(table.id)) {
        removedTables.push({ id: table.id, label: `${zone.name} · ${table.label}` });
      }
    }
    for (const seat of zone.seats) {
      if (!kept || !keptSeats.has(seat.id)) {
        removedSeats.push({
          id: seat.id,
          label: `${zone.name} · ${seat.row}${seat.number}`,
        });
      }
    }
  }

  const sold = await piecesWithSales({
    zoneIds: removedZones.map((zone) => zone.id),
    tableIds: removedTables.map((table) => table.id),
    seatIds: removedSeats.map((seat) => seat.id),
  });

  const blocked = [
    ...removedZones.filter((zone) => sold.zones.has(zone.id)).map((zone) => zone.name),
    ...removedTables.filter((table) => sold.tables.has(table.id)).map((t) => t.label),
    ...removedSeats.filter((seat) => sold.seats.has(seat.id)).map((s) => s.label),
  ];
  if (blocked.length > 0) {
    return NextResponse.json(
      {
        error:
          "No podés borrar partes que ya tienen ventas. Movelas o renombralas, pero no las elimines.",
        blocked: blocked.slice(0, 10),
      },
      { status: 409 },
    );
  }

  const knownZones = new Set(floor.zones.map((zone) => zone.id));
  const knownTables = new Set(
    floor.zones.flatMap((zone) => zone.tables.map((table) => table.id)),
  );
  const knownSeats = new Set(
    floor.zones.flatMap((zone) => zone.seats.map((seat) => seat.id)),
  );

  try {
    await prisma.$transaction(
      async (tx) => {
        // Commercial rows reference the physical ones, so they go first.
        if (removedTables.length > 0) {
          const ids = removedTables.map((table) => table.id);
          await tx.eventTable.deleteMany({ where: { tableId: { in: ids } } });
          await tx.table.deleteMany({ where: { id: { in: ids } } });
        }
        if (removedSeats.length > 0) {
          const ids = removedSeats.map((seat) => seat.id);
          await tx.eventSeat.deleteMany({ where: { seatId: { in: ids } } });
          await tx.seat.deleteMany({ where: { id: { in: ids } } });
        }
        if (removedZones.length > 0) {
          const ids = removedZones.map((zone) => zone.id);
          await tx.eventZone.deleteMany({ where: { zoneId: { in: ids } } });
          await tx.zone.deleteMany({ where: { id: { in: ids } } });
        }

        const touchedZoneIds: string[] = [];

        for (const [index, zone] of payload.zones.entries()) {
          const data = {
            name: zone.name,
            type: zone.type,
            description: zone.description ?? null,
            color: zone.color,
            order: index,
            capacity: zone.type === "GENERAL" ? (zone.capacity ?? 0) : null,
            posX: zone.posX,
            posY: zone.posY,
            width: zone.width,
            height: zone.height,
            rotation: zone.rotation,
          };

          let zoneId: string;
          if (zone.id && knownZones.has(zone.id)) {
            await tx.zone.update({ where: { id: zone.id }, data });
            zoneId = zone.id;
          } else {
            const created = await tx.zone.create({
              data: { ...data, floorId },
              select: { id: true },
            });
            zoneId = created.id;
          }
          touchedZoneIds.push(zoneId);

          for (const table of zone.tables ?? []) {
            const tableData = {
              label: table.label,
              seats: table.seats,
              hasChairs: table.hasChairs,
              shape: table.shape,
              posX: table.posX,
              posY: table.posY,
              width: table.width,
              height: table.height,
              rotation: table.rotation,
            };
            if (table.id && knownTables.has(table.id)) {
              await tx.table.update({ where: { id: table.id }, data: tableData });
            } else {
              await tx.table.create({ data: { ...tableData, zoneId } });
            }
          }

          // Seats come by the hundred: the ones that already exist are updated
          // one by one, the newly generated ones go in a single insert.
          const fresh = [];
          for (const seat of zone.seats ?? []) {
            const seatData = {
              row: seat.row,
              number: seat.number,
              posX: seat.posX,
              posY: seat.posY,
            };
            if (seat.id && knownSeats.has(seat.id)) {
              await tx.seat.update({ where: { id: seat.id }, data: seatData });
            } else {
              fresh.push({ ...seatData, zoneId });
            }
          }
          if (fresh.length > 0) {
            await tx.seat.createMany({ data: fresh });
          }
        }

        await tx.floor.update({
          where: { id: floorId },
          data: {
            name: payload.name ?? floor.name,
            canvasWidth: payload.canvasWidth,
            canvasHeight: payload.canvasHeight,
            backgroundImage: payload.backgroundImage ?? null,
          },
        });

        // A table drawn today has to appear in the events already using its zone
        await syncZoneTables(tx, touchedZoneIds);
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Hay etiquetas repetidas en una zona (mesas o asientos)" },
        { status: 409 },
      );
    }
    throw cause;
  }

  const saved = await prisma.floor.findUnique({
    where: { id: floorId },
    include: {
      zones: {
        orderBy: { order: "asc" },
        include: {
          tables: { orderBy: { label: "asc" } },
          seats: { orderBy: [{ row: "asc" }, { number: "asc" }] },
        },
      },
    },
  });

  return NextResponse.json({ floor: saved });
}
