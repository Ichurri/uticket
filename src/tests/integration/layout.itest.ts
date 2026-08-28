import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: { id: "", role: "ORGANIZER", name: "Test", email: "test@test.local" },
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireRole: async (...roles: string[]) => {
      if (!authState.user.id) {
        return {
          error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
        };
      }
      if (!roles.includes(authState.user.role)) {
        return {
          error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }),
        };
      }
      return { session: { user: authState.user } };
    },
  };
});

import { PUT as saveLayout } from "@/app/api/venues/[id]/floors/[floorId]/layout/route";
import { POST as createFloor } from "@/app/api/venues/[id]/floors/route";
import { DELETE as deleteFloor } from "@/app/api/venues/[id]/floors/[floorId]/route";
import { prisma } from "@/lib/prisma";
import {
  cleanDatabase,
  createApprovedEvent,
  createBuyer,
  createTableZone,
  putZoneOnSale,
} from "./helpers";

function actAs(user: { id: string; role?: string }) {
  authState.user = { ...authState.user, role: "ORGANIZER", ...user };
}

function layoutRequest(body: unknown) {
  return new Request("http://test.local/api/venues/v/floors/f/layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function floorContext(venueId: string, floorId: string) {
  return { params: Promise.resolve({ id: venueId, floorId }) };
}

/** The payload the editor sends: whatever exists keeps its id. */
function layout(
  zones: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
) {
  return {
    canvasWidth: 1000,
    canvasHeight: 700,
    zones,
    ...extra,
  };
}

const tablesZone = (extra: Record<string, unknown> = {}) => ({
  name: "Lounges",
  type: "TABLES",
  color: "#6D2BFF",
  posX: 100,
  posY: 100,
  width: 400,
  height: 300,
  rotation: 0,
  tables: [
    {
      label: "L1",
      seats: 8,
      hasChairs: false,
      shape: "RECT",
      posX: 20,
      posY: 20,
      width: 110,
      height: 60,
      rotation: 0,
    },
  ],
  ...extra,
});

beforeEach(async () => {
  await cleanDatabase();
});

describe("PUT .../floors/[floorId]/layout", () => {
  it("draws a new zone with its tables", async () => {
    const { organizer, venue, floor } = await createApprovedEvent();
    actAs({ id: organizer.id });

    const response = await saveLayout(
      layoutRequest(layout([tablesZone()])),
      floorContext(venue.id, floor.id),
    );
    expect(response.status).toBe(200);

    const saved = await prisma.zone.findFirstOrThrow({
      where: { floorId: floor.id, name: "Lounges" },
      include: { tables: true },
    });
    expect(saved.type).toBe("TABLES");
    expect(saved.tables).toHaveLength(1);
    // A lounge sofa: capacity 8, no chairs drawn around it
    expect(saved.tables[0].seats).toBe(8);
    expect(saved.tables[0].hasChairs).toBe(false);
    expect(saved.tables[0].shape).toBe("RECT");
  });

  it("moves a zone without touching the prices hanging off it", async () => {
    const { organizer, venue, floor, zone, eventZone } =
      await createApprovedEvent();
    actAs({ id: organizer.id });

    const response = await saveLayout(
      layoutRequest(
        layout([
          {
            id: zone.id,
            name: zone.name,
            type: "GENERAL",
            color: "#10B981",
            capacity: 40,
            posX: 300,
            posY: 250,
            width: 220,
            height: 160,
            rotation: 15,
          },
        ]),
      ),
      floorContext(venue.id, floor.id),
    );
    expect(response.status).toBe(200);

    const moved = await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } });
    expect(moved.posX).toBe(300);
    expect(moved.rotation).toBe(15);
    expect(moved.capacity).toBe(40);

    // Same row, same price: the save is a diff, not a wipe and recreate
    const stillThere = await prisma.eventZone.findUniqueOrThrow({
      where: { id: eventZone.id },
    });
    expect(Number(stillThere.price)).toBe(100);
  });

  it("puts a newly drawn table on sale for the events already using the zone", async () => {
    const { organizer, venue, floor, event } = await createApprovedEvent();
    actAs({ id: organizer.id });

    const { zone, tables } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);
    expect(await prisma.eventTable.count({ where: { eventZoneId: eventZone.id } }))
      .toBe(2);

    const existing = await prisma.zone.findUniqueOrThrow({
      where: { id: zone.id },
      include: { tables: true },
    });

    const response = await saveLayout(
      layoutRequest(
        layout([
          {
            id: zone.id,
            name: zone.name,
            type: "TABLES",
            color: "#6D2BFF",
            posX: 0,
            posY: 0,
            width: 400,
            height: 300,
            rotation: 0,
            tables: [
              ...existing.tables.map((table) => ({
                id: table.id,
                label: table.label,
                seats: table.seats,
                hasChairs: table.hasChairs,
                shape: table.shape,
                posX: table.posX,
                posY: table.posY,
                width: table.width,
                height: table.height,
                rotation: table.rotation,
              })),
              {
                label: "M3",
                seats: 10,
                hasChairs: true,
                shape: "ROUND",
                posX: 200,
                posY: 20,
                width: 80,
                height: 80,
                rotation: 0,
              },
            ],
          },
        ]),
      ),
      floorContext(venue.id, floor.id),
    );
    expect(response.status).toBe(200);

    const onSale = await prisma.eventTable.findMany({
      where: { eventZoneId: eventZone.id },
      include: { table: { select: { label: true } } },
    });
    expect(onSale).toHaveLength(3);
    expect(onSale.map((row) => row.table.label).sort()).toEqual([
      "M1",
      "M2",
      "M3",
    ]);
    expect(tables).toHaveLength(2);
  });

  it("refuses to delete a table that was already sold", async () => {
    const { organizer, venue, floor, event } = await createApprovedEvent();
    const buyer = await createBuyer();
    actAs({ id: organizer.id });

    const { zone, tables } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);
    const eventTable = await prisma.eventTable.findFirstOrThrow({
      where: { eventZoneId: eventZone.id, tableId: tables[0].id },
    });
    await prisma.order.create({
      data: {
        buyerId: buyer.id,
        eventId: event.id,
        totalAmount: 100,
        expiresAt: new Date(Date.now() + 900_000),
        items: {
          create: {
            quantity: 1,
            unitPrice: 100,
            eventZoneId: eventZone.id,
            eventTableId: eventTable.id,
          },
        },
      },
    });

    const response = await saveLayout(
      layoutRequest(
        layout([
          {
            id: zone.id,
            name: zone.name,
            type: "TABLES",
            color: "#6D2BFF",
            posX: 0,
            posY: 0,
            width: 400,
            height: 300,
            rotation: 0,
            // M1 dropped — that is the one with a sale on it
            tables: [
              {
                id: tables[1].id,
                label: "M2",
                seats: 2,
                hasChairs: true,
                shape: "ROUND",
                posX: 100,
                posY: 20,
                width: 60,
                height: 60,
                rotation: 0,
              },
            ],
          },
        ]),
      ),
      floorContext(venue.id, floor.id),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.blocked).toContain("Mesas · M1");
    // Nothing was written: the whole save is refused before the transaction
    expect(await prisma.table.count({ where: { zoneId: zone.id } })).toBe(2);
  });

  it("deletes a zone nobody bought from, commercial rows included", async () => {
    const { organizer, venue, floor, event } = await createApprovedEvent();
    actAs({ id: organizer.id });

    const { zone } = await createTableZone(floor.id);
    const eventZone = await putZoneOnSale(event.id, zone.id);

    const response = await saveLayout(
      layoutRequest(layout([])),
      floorContext(venue.id, floor.id),
    );
    expect(response.status).toBe(200);

    expect(await prisma.zone.findUnique({ where: { id: zone.id } })).toBeNull();
    expect(
      await prisma.eventZone.findUnique({ where: { id: eventZone.id } }),
    ).toBeNull();
    expect(await prisma.table.count({ where: { zoneId: zone.id } })).toBe(0);
  });

  it("regenerates the seat grid of a numbered zone", async () => {
    const { organizer, venue, floor, zone, seats } = await createApprovedEvent({
      numbered: true,
    });
    actAs({ id: organizer.id });
    expect(seats).toHaveLength(4);

    const response = await saveLayout(
      layoutRequest(
        layout([
          {
            id: zone.id,
            name: "Platea",
            type: "SEATED",
            color: "#6D2BFF",
            posX: 0,
            posY: 0,
            width: 300,
            height: 200,
            rotation: 0,
            seats: [
              { row: "A", number: 1, posX: 10, posY: 10 },
              { row: "A", number: 2, posX: 38, posY: 10 },
              { row: "A", number: 3, posX: 66, posY: 10 },
            ],
          },
        ]),
      ),
      floorContext(venue.id, floor.id),
    );
    expect(response.status).toBe(200);

    const stored = await prisma.seat.findMany({ where: { zoneId: zone.id } });
    expect(stored).toHaveLength(3);
    expect(stored.every((seat) => seat.row === "A")).toBe(true);
  });

  it("keeps the plan out of another organizer's hands", async () => {
    const { venue, floor } = await createApprovedEvent();
    const intruder = await prisma.user.create({
      data: {
        email: `other-${Date.now()}@test.local`,
        name: "Otro",
        role: "ORGANIZER",
        emailVerified: new Date(),
      },
    });
    actAs({ id: intruder.id });

    const response = await saveLayout(
      layoutRequest(layout([tablesZone()])),
      floorContext(venue.id, floor.id),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a table with no capacity", async () => {
    const { organizer, venue, floor } = await createApprovedEvent();
    actAs({ id: organizer.id });

    const response = await saveLayout(
      layoutRequest(layout([tablesZone({ tables: [] })])),
      floorContext(venue.id, floor.id),
    );
    expect(response.status).toBe(400);
  });

  it("renames the floor and resizes the canvas", async () => {
    const { organizer, venue, floor, zone } = await createApprovedEvent();
    actAs({ id: organizer.id });

    await saveLayout(
      layoutRequest(
        layout(
          [
            {
              id: zone.id,
              name: zone.name,
              type: "GENERAL",
              color: "#6D2BFF",
              capacity: 10,
              posX: 0,
              posY: 0,
              width: 200,
              height: 150,
              rotation: 0,
            },
          ],
          { name: "Terraza", canvasWidth: 1400, canvasHeight: 900 },
        ),
      ),
      floorContext(venue.id, floor.id),
    );

    const saved = await prisma.floor.findUniqueOrThrow({ where: { id: floor.id } });
    expect(saved.name).toBe("Terraza");
    expect(saved.canvasWidth).toBe(1400);
  });
});

describe("floors", () => {
  it("adds a second floor and refuses a repeated name", async () => {
    const { organizer, venue } = await createApprovedEvent();
    actAs({ id: organizer.id });

    const context = { params: Promise.resolve({ id: venue.id }) };
    const body = { name: "Planta alta", canvasWidth: 1000, canvasHeight: 700 };

    const first = await createFloor(
      new Request("http://test.local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      context,
    );
    expect(first.status).toBe(201);

    const again = await createFloor(
      new Request("http://test.local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: venue.id }) },
    );
    expect(again.status).toBe(409);
  });

  it("never leaves a venue without a floor", async () => {
    const { organizer, venue, floor } = await createApprovedEvent();
    actAs({ id: organizer.id });

    const response = await deleteFloor(
      new Request("http://test.local", { method: "DELETE" }),
      floorContext(venue.id, floor.id),
    );
    expect(response.status).toBe(409);
    expect(await prisma.floor.count({ where: { venueId: venue.id } })).toBe(1);
  });
});
