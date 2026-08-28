"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { PlanViewport } from "@/components/seats/PlanViewport";
import { TableGlyph } from "@/components/venue-editor/TableGlyph";
import { isTappable } from "@/lib/map-view";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import type {
  EventLiveMap,
  LiveFloor,
  LiveHolder,
  LiveSeat,
  LiveState,
  LiveTable,
  LiveZone,
} from "@/lib/event-live-map";

const STATE_LABELS: Record<LiveState, string> = {
  AVAILABLE: "Libre",
  PENDING: "Por pagar",
  CONFIRMED: "Vendido",
  BLOCKED: "Bloqueado",
};

/** The plan is read by colour, so state beats the zone's own palette here. */
const STATE_FILL: Record<LiveState, string> = {
  AVAILABLE: "var(--color-card)",
  PENDING: "var(--color-warning)",
  CONFIRMED: "var(--color-success)",
  BLOCKED: "var(--color-muted)",
};

const STATE_STROKE: Record<LiveState, string> = {
  AVAILABLE: "var(--color-border)",
  PENDING: "var(--color-warning)",
  CONFIRMED: "var(--color-success)",
  BLOCKED: "var(--color-border)",
};

const STATE_DOT: Record<LiveState, string> = {
  AVAILABLE: "border border-border bg-card",
  PENDING: "bg-warning",
  CONFIRMED: "bg-success",
  BLOCKED: "bg-muted",
};

type Picked =
  | { kind: "table"; zone: LiveZone; table: LiveTable }
  | { kind: "seat"; zone: LiveZone; seat: LiveSeat }
  | { kind: "zone"; zone: LiveZone }
  | null;

function boundsOf(floor: LiveFloor) {
  if (floor.zones.length === 0) {
    return {
      posX: 0,
      posY: 0,
      width: floor.canvasWidth,
      height: floor.canvasHeight,
    };
  }
  const minX = Math.min(...floor.zones.map((zone) => zone.posX));
  const minY = Math.min(...floor.zones.map((zone) => zone.posY));
  const maxX = Math.max(...floor.zones.map((zone) => zone.posX + zone.width));
  const maxY = Math.max(...floor.zones.map((zone) => zone.posY + zone.height));
  return { posX: minX, posY: minY, width: maxX - minX, height: maxY - minY };
}

export function LiveMapView({ map }: { map: EventLiveMap }) {
  const [activeFloorId, setActiveFloorId] = useState(map.floors[0]?.id ?? "");
  const [picked, setPicked] = useState<Picked>(null);

  if (map.floors.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Este evento todavía no tiene zonas. Dibujá el plano del venue y
          ponele precios.
        </CardContent>
      </Card>
    );
  }

  const floor = map.floors.find((item) => item.id === activeFloorId) ?? map.floors[0];

  return (
    <div className="flex flex-col gap-4">
      {map.floors.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {map.floors.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveFloorId(item.id);
                setPicked(null);
              }}
              className={cn(
                "min-h-11 rounded-xl border px-3.5 text-sm font-medium transition-colors",
                item.id === floor.id
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      <PlanViewport
        key={floor.id}
        canvas={{ width: floor.canvasWidth, height: floor.canvasHeight }}
        bounds={boundsOf(floor)}
        ariaLabel={`Estado de venta de ${floor.name}. El detalle por zona está listado debajo.`}
      >
        {({ scale, focusBox }) =>
          floor.zones.map((zone) => {
            const smallest =
              zone.type === "TABLES"
                ? Math.min(
                    ...zone.tables.map((table) => Math.min(table.width, table.height)),
                    Infinity,
                  )
                : zone.type === "SEATED"
                  ? 20
                  : Math.min(zone.width, zone.height);
            const pickable = isTappable(smallest, scale);

            return (
              <g
                key={zone.eventZoneId}
                transform={`translate(${zone.posX},${zone.posY}) rotate(${zone.rotation},${zone.width / 2},${zone.height / 2})`}
              >
                <rect
                  width={zone.width}
                  height={zone.height}
                  rx={14}
                  fill={zone.color}
                  fillOpacity={zone.isEnabled ? 0.08 : 0.03}
                  stroke={zone.color}
                  strokeOpacity={zone.isEnabled ? 0.8 : 0.3}
                  strokeWidth={1.5}
                  strokeDasharray={zone.isEnabled ? undefined : "8 5"}
                  className={pickable ? "cursor-pointer" : "cursor-zoom-in"}
                  onClick={() => {
                    if (pickable || zone.type === "GENERAL") {
                      setPicked({ kind: "zone", zone });
                    } else {
                      focusBox(zone);
                    }
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
                    fontWeight={700}
                    textAnchor="middle"
                    fill={zone.color}
                    className="pointer-events-none"
                  >
                    {zone.confirmed + zone.pending} / {zone.capacity}
                  </text>
                )}

                {zone.seats.map((seat) => (
                  <rect
                    key={seat.seatId}
                    x={seat.posX}
                    y={seat.posY}
                    width={20}
                    height={20}
                    rx={5}
                    fill={STATE_FILL[seat.state]}
                    stroke={STATE_STROKE[seat.state]}
                    strokeWidth={1}
                    className={pickable ? "cursor-pointer" : "pointer-events-none"}
                    onClick={() => {
                      if (!pickable) return;
                      setPicked({ kind: "seat", zone, seat });
                    }}
                  />
                ))}

                {zone.tables.map((table) => (
                  <g
                    key={table.eventTableId}
                    className={pickable ? "cursor-pointer" : "pointer-events-none"}
                    onClick={() => {
                      if (!pickable) return;
                      setPicked({ kind: "table", zone, table });
                    }}
                  >
                    <TableGlyph
                      table={table}
                      fill={STATE_FILL[table.state]}
                      stroke={STATE_STROKE[table.state]}
                      labelFill={
                        table.state === "AVAILABLE"
                          ? "var(--color-foreground)"
                          : table.state === "BLOCKED"
                            ? "var(--color-muted-foreground)"
                            : "#ffffff"
                      }
                      muted={table.state === "BLOCKED"}
                    />
                    {table.seatsSold > 0 && table.state !== "CONFIRMED" && (
                      <text
                        x={table.posX + table.width / 2}
                        y={table.posY + table.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill="var(--color-muted-foreground)"
                        className="pointer-events-none"
                      >
                        {table.seatsSold}/{table.seats}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            );
          })
        }
      </PlanViewport>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {(Object.keys(STATE_LABELS) as LiveState[]).map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span className={cn("h-3.5 w-3.5 rounded", STATE_DOT[state])} />
            {STATE_LABELS[state]}
          </span>
        ))}
      </div>

      {picked && <PickedPanel picked={picked} onClose={() => setPicked(null)} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {floor.zones.map((zone) => (
          <button
            key={zone.eventZoneId}
            type="button"
            onClick={() => setPicked({ kind: "zone", zone })}
            className="rounded-2xl border border-border p-4 text-left transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                {zone.name}
              </span>
              {!zone.isEnabled && <Badge>No está a la venta</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {zone.confirmed} vendidos · {zone.pending} por pagar ·{" "}
              {zone.available} libres de {zone.capacity}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="flex h-full">
                <span
                  className="bg-success"
                  style={{
                    width: `${zone.capacity ? (zone.confirmed / zone.capacity) * 100 : 0}%`,
                  }}
                />
                <span
                  className="bg-warning"
                  style={{
                    width: `${zone.capacity ? (zone.pending / zone.capacity) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <p className="mt-2 text-sm">
              <strong>{formatCurrency(zone.revenueConfirmed)}</strong> cobrado
              {zone.revenuePending > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {formatCurrency(zone.revenuePending)} por cobrar
                </span>
              )}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function PickedPanel({
  picked,
  onClose,
}: {
  picked: NonNullable<Picked>;
  onClose: () => void;
}) {
  const title =
    picked.kind === "table"
      ? `${picked.zone.name} · ${picked.table.label}`
      : picked.kind === "seat"
        ? `${picked.zone.name} · Asiento ${picked.seat.row}${picked.seat.number}`
        : picked.zone.name;

  const state =
    picked.kind === "table"
      ? picked.table.state
      : picked.kind === "seat"
        ? picked.seat.state
        : null;

  const holders: LiveHolder[] =
    picked.kind === "table"
      ? picked.table.holders
      : picked.kind === "seat"
        ? picked.seat.holder
          ? [picked.seat.holder]
          : []
        : picked.zone.holders;

  const detail =
    picked.kind === "table"
      ? `${picked.table.seats} personas · ${formatCurrency(picked.table.price)}`
      : picked.kind === "seat"
        ? null
        : `${picked.zone.confirmed + picked.zone.pending} de ${picked.zone.capacity} · ${formatCurrency(picked.zone.price)} por entrada`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{title}</h3>
            {detail && (
              <p className="text-sm text-muted-foreground">{detail}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {state && (
              <Badge
                variant={
                  state === "CONFIRMED"
                    ? "success"
                    : state === "PENDING"
                      ? "warning"
                      : "default"
                }
              >
                {STATE_LABELS[state]}
              </Badge>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cerrar
            </button>
          </div>
        </div>

        {holders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nadie lo tomó todavía.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {holders.map((holder) => (
              <li
                key={`${holder.orderId}-${holder.reference}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{holder.buyerName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {holder.reference} · {holder.people} persona
                    {holder.people === 1 ? "" : "s"} ·{" "}
                    {formatCurrency(holder.amount)} ·{" "}
                    {formatDateTime(holder.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={ORDER_STATUS_LABELS[holder.orderStatus].variant}
                  >
                    {ORDER_STATUS_LABELS[holder.orderStatus].label}
                  </Badge>
                  <Link
                    href="/dashboard/orders"
                    className="text-sm font-medium text-primary"
                  >
                    Ver pedidos
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
