"use client";

import { TableGlyph } from "@/components/venue-editor/TableGlyph";
import { PlanViewport } from "@/components/seats/PlanViewport";
import { isTappable } from "@/lib/map-view";
import {
  floorBounds,
  seatIsTaken,
  smallestTarget,
  tableFreeSpots,
  tableIsTaken,
  zoneIsSoldOut,
} from "@/lib/seat-map-view";
import type { FloorDto, SeatDto, TableDto, ZoneDto } from "@/types/seat-map";

export interface VenueMapProps {
  floor: FloorDto;
  /** Cart keys currently selected, so the map shows what you already picked */
  selectedKeys: Set<string>;
  onSelectTable: (zone: ZoneDto, table: TableDto) => void;
  onSelectSeat: (zone: ZoneDto, seat: SeatDto) => void;
  /** Tapped a zone that cannot be picked from the map (yet) */
  onFocusZone: (zone: ZoneDto) => void;
}

/**
 * The room as the organizer drew it, read-only.
 *
 * On a phone the whole plan is ~0.35 px per canvas unit, which makes a table
 * about 20 px across — under any sane touch target. So the map zooms: while a
 * zone's pieces are too small to hit, tapping the zone frames it instead of
 * guessing which table you meant. The lists below stay the precise, keyboard
 * accessible way to buy; this is the "where am I sitting" view.
 */
export function VenueMap({
  floor,
  selectedKeys,
  onSelectTable,
  onSelectSeat,
  onFocusZone,
}: VenueMapProps) {
  return (
    <div className="flex flex-col gap-2">
      <PlanViewport
        canvas={{ width: floor.canvasWidth, height: floor.canvasHeight }}
        bounds={floorBounds(floor)}
        ariaLabel={`Plano de ${floor.name}. Las zonas y sus precios están listados debajo del mapa.`}
      >
        {({ scale, focusBox }) =>
          floor.zones.map((zone) => {
            const pickable = isTappable(smallestTarget(zone), scale);
            const soldOut = zoneIsSoldOut(zone);
            return (
              <g
                key={zone.id}
                transform={`translate(${zone.posX},${zone.posY}) rotate(${zone.rotation},${zone.width / 2},${zone.height / 2})`}
              >
                <rect
                  width={zone.width}
                  height={zone.height}
                  rx={14}
                  fill={zone.color}
                  fillOpacity={soldOut ? 0.05 : 0.12}
                  stroke={zone.color}
                  strokeOpacity={soldOut ? 0.3 : 0.9}
                  strokeWidth={1.5}
                  strokeDasharray={zone.type === "GENERAL" ? "8 5" : undefined}
                  className={pickable ? "" : "cursor-zoom-in"}
                  onClick={() => {
                    // Nothing to pick inside a general zone: send them to its
                    // stepper. Otherwise zoom in until the pieces are tappable.
                    if (zone.type === "GENERAL" || pickable) onFocusZone(zone);
                    else focusBox(zone);
                  }}
                />

                <text
                  x={12}
                  y={22}
                  fontSize={14}
                  fontWeight={700}
                  fill={zone.color}
                  className="pointer-events-none"
                >
                  {zone.name}
                </text>

                {zone.type === "GENERAL" && (
                  <text
                    x={zone.width / 2}
                    y={zone.height / 2 + 6}
                    fontSize={16}
                    fontWeight={600}
                    textAnchor="middle"
                    fill={zone.color}
                    opacity={0.8}
                    className="pointer-events-none"
                  >
                    {soldOut ? "Agotado" : `${zone.available} lugares`}
                  </text>
                )}

                {zone.type === "SEATED" &&
                  zone.seats.map((seat) => {
                    const taken = seatIsTaken(seat);
                    const selected = selectedKeys.has(seat.id);
                    return (
                      <rect
                        key={seat.id}
                        x={seat.posX}
                        y={seat.posY}
                        width={20}
                        height={20}
                        rx={5}
                        fill={
                          selected
                            ? "var(--color-primary)"
                            : taken
                              ? "var(--color-muted)"
                              : zone.color
                        }
                        fillOpacity={selected || taken ? 1 : 0.5}
                        stroke={selected ? "var(--color-primary)" : zone.color}
                        strokeOpacity={taken ? 0.25 : 1}
                        className={
                          !taken && pickable
                            ? "cursor-pointer"
                            : "pointer-events-none"
                        }
                        onClick={() => {
                          if (taken || !pickable) return;
                          onSelectSeat(zone, seat);
                        }}
                      />
                    );
                  })}

                {zone.type === "TABLES" &&
                  zone.tables.map((table) => {
                    const taken = tableIsTaken(table, zone.tableSaleMode);
                    const selected = selectedKeys.has(table.id);
                    return (
                      <g
                        key={table.id}
                        className={
                          !taken && pickable
                            ? "cursor-pointer"
                            : "pointer-events-none"
                        }
                        onClick={() => {
                          if (taken || !pickable) return;
                          onSelectTable(zone, table);
                        }}
                      >
                        <TableGlyph
                          table={table}
                          fill={
                            selected
                              ? "var(--color-primary)"
                              : taken
                                ? "var(--color-muted)"
                                : zone.color
                          }
                          stroke={
                            selected
                              ? "var(--color-primary)"
                              : taken
                                ? "var(--color-border)"
                                : zone.color
                          }
                          labelFill={
                            selected
                              ? "var(--color-primary-foreground)"
                              : taken
                                ? "var(--color-muted-foreground)"
                                : undefined
                          }
                          muted={taken}
                        />
                        {zone.tableSaleMode === "PER_SEAT" && !taken && (
                          <text
                            x={table.posX + table.width / 2}
                            y={table.posY + table.height + 14}
                            textAnchor="middle"
                            fontSize={10}
                            fill={zone.color}
                            className="pointer-events-none"
                          >
                            {tableFreeSpots(table)} libres
                          </text>
                        )}
                      </g>
                    );
                  })}
              </g>
            );
          })
        }
      </PlanViewport>

      <p className="text-xs text-muted-foreground">
        Pellizcá para acercar y arrastrá para moverte. Tocá una zona para
        acercarte a ella.
      </p>
    </div>
  );
}
