"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  dragTableTo,
  dragZoneTo,
  GRID,
  resizeZoneTo,
  snap,
} from "@/lib/venue-layout";
import { TableGlyph } from "./TableGlyph";
import type { DraftFloor, DraftTable, DraftZone } from "./draft";

export type Selection =
  | { kind: "zone"; zoneKey: string }
  | { kind: "table"; zoneKey: string; tableKey: string }
  | null;

type Drag =
  | {
      kind: "zone";
      zoneKey: string;
      fromX: number;
      fromY: number;
      atX: number;
      atY: number;
    }
  | {
      kind: "zone-size";
      zoneKey: string;
      fromW: number;
      fromH: number;
      atX: number;
      atY: number;
    }
  | {
      kind: "table";
      zoneKey: string;
      tableKey: string;
      fromX: number;
      fromY: number;
      atX: number;
      atY: number;
      zoneRotation: number;
    }
  | { kind: "draw"; atX: number; atY: number };

const HANDLE = 12;

export function PlanCanvas({
  floor,
  selection,
  onSelect,
  onZoneChange,
  onTableChange,
  onDrawZone,
  drawing,
  zoom,
  soldZoneIds,
}: {
  floor: DraftFloor;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onZoneChange: (zoneKey: string, patch: Partial<DraftZone>) => void;
  onTableChange: (
    zoneKey: string,
    tableKey: string,
    patch: Partial<DraftTable>,
  ) => void;
  onDrawZone: (rect: {
    posX: number;
    posY: number;
    width: number;
    height: number;
  }) => void;
  drawing: boolean;
  zoom: number;
  soldZoneIds: Set<string>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [band, setBand] = useState<null | {
    posX: number;
    posY: number;
    width: number;
    height: number;
  }>(null);

  /** Client pixels → canvas units. The SVG is drawn at `zoom` × its viewBox. */
  function toCanvas(event: { clientX: number; clientY: number }) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  }

  function beginDrag(event: React.PointerEvent, next: Drag) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = next;
  }

  function handlePointerMove(event: React.PointerEvent) {
    const active = drag.current;
    if (!active) return;
    const point = toCanvas(event);
    const dx = point.x - active.atX;
    const dy = point.y - active.atY;

    if (active.kind === "draw") {
      setBand({
        posX: snap(Math.min(active.atX, point.x)),
        posY: snap(Math.min(active.atY, point.y)),
        width: snap(Math.abs(dx)),
        height: snap(Math.abs(dy)),
      });
      return;
    }

    const zone = floor.zones.find((item) => item.key === active.zoneKey);
    if (!zone) return;

    const canvas = { width: floor.canvasWidth, height: floor.canvasHeight };

    if (active.kind === "zone") {
      onZoneChange(
        zone.key,
        dragZoneTo({
          from: { posX: active.fromX, posY: active.fromY },
          delta: { dx, dy },
          zone,
          canvas,
        }),
      );
      return;
    }

    if (active.kind === "zone-size") {
      onZoneChange(
        zone.key,
        resizeZoneTo({
          from: { width: active.fromW, height: active.fromH },
          delta: { dx, dy },
          at: zone,
          canvas,
          rotation: zone.rotation,
        }),
      );
      return;
    }

    const table = zone.tables.find((item) => item.key === active.tableKey);
    if (!table) return;
    onTableChange(
      zone.key,
      table.key,
      dragTableTo({
        from: { posX: active.fromX, posY: active.fromY },
        delta: { dx, dy },
        zoneRotation: active.zoneRotation,
        table,
        zone,
      }),
    );
  }

  function handlePointerUp() {
    const active = drag.current;
    drag.current = null;
    if (active?.kind === "draw") {
      if (band && band.width >= 40 && band.height >= 40) onDrawZone(band);
      setBand(null);
    }
  }

  return (
    <div className="relative overflow-auto rounded-2xl border border-border bg-muted/40">
      <svg
        ref={svgRef}
        width={floor.canvasWidth * zoom}
        height={floor.canvasHeight * zoom}
        viewBox={`0 0 ${floor.canvasWidth} ${floor.canvasHeight}`}
        className={cn(
          "block touch-none select-none",
          drawing ? "cursor-crosshair" : "cursor-default",
        )}
        onPointerDown={(event) => {
          if (drawing) {
            const point = toCanvas(event);
            beginDrag(event, { kind: "draw", atX: point.x, atY: point.y });
            return;
          }
          onSelect(null);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <pattern
            id="plan-grid"
            width={GRID * 5}
            height={GRID * 5}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />
          </pattern>
        </defs>
        <rect
          width={floor.canvasWidth}
          height={floor.canvasHeight}
          className="fill-card"
        />
        <rect
          width={floor.canvasWidth}
          height={floor.canvasHeight}
          fill="url(#plan-grid)"
        />

        {floor.zones.map((zone) => {
          const zoneSelected =
            selection?.kind === "zone" && selection.zoneKey === zone.key;
          const active = selection?.zoneKey === zone.key;
          const sold = Boolean(zone.id && soldZoneIds.has(zone.id));

          return (
            <g
              key={zone.key}
              transform={`translate(${zone.posX},${zone.posY}) rotate(${zone.rotation},${zone.width / 2},${zone.height / 2})`}
            >
              <rect
                width={zone.width}
                height={zone.height}
                rx={14}
                fill={zone.color}
                fillOpacity={active ? 0.18 : 0.1}
                stroke={zone.color}
                strokeWidth={zoneSelected ? 3 : 1.5}
                strokeDasharray={zone.type === "GENERAL" ? "8 5" : undefined}
                className={drawing ? "pointer-events-none" : "cursor-move"}
                onPointerDown={(event) => {
                  if (drawing) return;
                  onSelect({ kind: "zone", zoneKey: zone.key });
                  const point = toCanvas(event);
                  beginDrag(event, {
                    kind: "zone",
                    zoneKey: zone.key,
                    fromX: zone.posX,
                    fromY: zone.posY,
                    atX: point.x,
                    atY: point.y,
                  });
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
                {sold ? " 🔒" : ""}
              </text>

              {zone.type === "GENERAL" && (
                <text
                  x={zone.width / 2}
                  y={zone.height / 2 + 6}
                  fontSize={18}
                  fontWeight={700}
                  textAnchor="middle"
                  fill={zone.color}
                  opacity={0.75}
                  className="pointer-events-none"
                >
                  {zone.capacity} personas
                </text>
              )}

              {zone.type === "SEATED" &&
                zone.seats.map((seat) => (
                  <rect
                    key={seat.key}
                    x={seat.posX}
                    y={seat.posY}
                    width={20}
                    height={20}
                    rx={5}
                    fill={zone.color}
                    fillOpacity={0.55}
                    stroke={zone.color}
                    className="pointer-events-none"
                  />
                ))}

              {zone.type === "TABLES" &&
                zone.tables.map((table) => {
                  const tableSelected =
                    selection?.kind === "table" &&
                    selection.tableKey === table.key;
                  return (
                    <g
                      key={table.key}
                      className={
                        drawing ? "pointer-events-none" : "cursor-move"
                      }
                      onPointerDown={(event) => {
                        if (drawing) return;
                        onSelect({
                          kind: "table",
                          zoneKey: zone.key,
                          tableKey: table.key,
                        });
                        const point = toCanvas(event);
                        beginDrag(event, {
                          kind: "table",
                          zoneKey: zone.key,
                          tableKey: table.key,
                          fromX: table.posX,
                          fromY: table.posY,
                          atX: point.x,
                          atY: point.y,
                          zoneRotation: zone.rotation,
                        });
                      }}
                    >
                      <TableGlyph
                        table={table}
                        fill={zone.color}
                        stroke={zone.color}
                      />
                      {tableSelected && (
                        <rect
                          x={table.posX - 6}
                          y={table.posY - 6}
                          width={table.width + 12}
                          height={table.height + 12}
                          rx={10}
                          fill="none"
                          stroke={zone.color}
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          className="pointer-events-none"
                        />
                      )}
                    </g>
                  );
                })}

              {zoneSelected && !drawing && (
                <rect
                  x={zone.width - HANDLE / 2}
                  y={zone.height - HANDLE / 2}
                  width={HANDLE}
                  height={HANDLE}
                  rx={3}
                  fill={zone.color}
                  className="cursor-nwse-resize"
                  onPointerDown={(event) => {
                    const point = toCanvas(event);
                    beginDrag(event, {
                      kind: "zone-size",
                      zoneKey: zone.key,
                      fromW: zone.width,
                      fromH: zone.height,
                      atX: point.x,
                      atY: point.y,
                    });
                  }}
                />
              )}
            </g>
          );
        })}

        {band && (
          <rect
            x={band.posX}
            y={band.posY}
            width={band.width}
            height={band.height}
            rx={14}
            fill="var(--color-primary)"
            fillOpacity={0.15}
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeDasharray="8 5"
            className="pointer-events-none"
          />
        )}
      </svg>
    </div>
  );
}
