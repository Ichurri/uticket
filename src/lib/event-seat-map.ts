import { prisma } from "@/lib/prisma";
import { getEventInventory, isTaken } from "@/lib/seats";
import { inclusionSummary } from "@/lib/order-items";
import {
  resolveInclusion,
  seatPrice,
  tablePrice,
  tableSeatPrice,
} from "@/lib/event-zones";
import type { EventSeatMapDto, FloorDto, ZoneDto } from "@/types/seat-map";

/**
 * Everything the buyer's map needs, read from the COMMERCIAL layer.
 *
 * Only enabled EventZones make it in — a zone the organizer has not put on
 * sale simply does not exist for this event.
 */
export async function getEventSeatMap(
  eventId: string,
  eventTitle: string,
): Promise<EventSeatMapDto> {
  const [eventZones, inventory] = await Promise.all([
    prisma.eventZone.findMany({
      where: { eventId, isEnabled: true },
      include: {
        eventTables: {
          include: { table: true },
          orderBy: { table: { label: "asc" } },
        },
        eventSeats: { select: { seatId: true, price: true, status: true } },
        zone: {
          include: {
            floor: true,
            seats: { orderBy: [{ row: "asc" }, { number: "asc" }] },
          },
        },
      },
    }),
    getEventInventory(eventId),
  ]);

  const byFloor = new Map<string, FloorDto>();

  for (const eventZone of eventZones) {
    const zone = eventZone.zone;
    const floor = zone.floor;

    if (!byFloor.has(floor.id)) {
      byFloor.set(floor.id, {
        id: floor.id,
        name: floor.name,
        order: floor.order,
        canvasWidth: floor.canvasWidth,
        canvasHeight: floor.canvasHeight,
        backgroundImage: floor.backgroundImage,
        zones: [],
      });
    }

    const overrideBySeatId = new Map(
      eventZone.eventSeats.map((eventSeat) => [eventSeat.seatId, eventSeat]),
    );

    const tables = eventZone.eventTables.map((eventTable) => {
      const inclusion = resolveInclusion(eventTable, eventZone);
      return {
        id: eventTable.id,
        label: eventTable.table.label,
        seats: eventTable.table.seats,
        seatsSold: eventTable.seatsSold,
        hasChairs: eventTable.table.hasChairs,
        shape: eventTable.table.shape,
        posX: eventTable.table.posX,
        posY: eventTable.table.posY,
        width: eventTable.table.width,
        height: eventTable.table.height,
        rotation: eventTable.table.rotation,
        price: tablePrice(eventTable, eventZone),
        seatPrice: tableSeatPrice(eventTable, eventZone),
        inclusion: inclusionSummary(inclusion),
        status: eventTable.status,
      };
    });

    const seats = zone.seats.map((seat) => {
      const override = overrideBySeatId.get(seat.id) ?? null;
      return {
        id: seat.id,
        row: seat.row,
        number: seat.number,
        posX: seat.posX,
        posY: seat.posY,
        price: seatPrice(override, eventZone),
        status: override?.status ?? ("AVAILABLE" as const),
      };
    });

    const capacityForSale =
      eventZone.capacityForSale ?? zone.capacity ?? 0;

    let capacity = 0;
    let available = 0;
    if (zone.type === "TABLES") {
      for (const table of tables) {
        capacity += table.seats;
        if (table.status === "AVAILABLE") {
          available +=
            eventZone.tableSaleMode === "PER_SEAT"
              ? table.seats - table.seatsSold
              : table.seats;
        } else if (
          eventZone.tableSaleMode === "PER_SEAT" &&
          table.status === "HELD"
        ) {
          available += Math.max(0, table.seats - table.seatsSold);
        }
      }
    } else if (zone.type === "SEATED") {
      capacity = seats.length;
      available = seats.filter((seat) => !isTaken(seat.status)).length;
    } else {
      capacity = capacityForSale;
      available = Math.max(
        0,
        capacityForSale - (inventory.generalTaken.get(eventZone.id) ?? 0),
      );
    }

    const zoneDto: ZoneDto = {
      id: eventZone.id,
      zoneId: zone.id,
      name: zone.name,
      type: zone.type,
      description: zone.description,
      color: zone.color,
      posX: zone.posX,
      posY: zone.posY,
      width: zone.width,
      height: zone.height,
      rotation: zone.rotation,
      price: Number(eventZone.price),
      tableSaleMode: eventZone.tableSaleMode,
      capacity,
      available,
      tables,
      seats,
    };

    byFloor.get(floor.id)!.zones.push(zoneDto);
  }

  const floors = [...byFloor.values()].sort((a, b) => a.order - b.order);
  for (const floor of floors) {
    floor.zones.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { eventId, eventTitle, floors };
}
