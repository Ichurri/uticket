"use client";

import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { ZONE_TYPE_LABELS } from "@/lib/venue-zones";
import type { ZoneType, TableShape } from "@/generated/prisma/enums";
import {
  draftFloorCapacity,
  draftZoneCapacity,
  ZONE_COLORS,
  type DraftFloor,
  type DraftTable,
  type DraftZone,
} from "./draft";
import type { Selection } from "./PlanCanvas";

const SHAPE_LABELS: Record<TableShape, string> = {
  ROUND: "Redonda",
  SQUARE: "Cuadrada",
  RECT: "Rectangular",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          className="h-10"
          value={value}
          min={min}
          max={max}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export interface InspectorProps {
  floor: DraftFloor;
  selection: Selection;
  soldZoneIds: Set<string>;
  onSelect: (selection: Selection) => void;
  onFloorChange: (patch: Partial<DraftFloor>) => void;
  onZoneChange: (zoneKey: string, patch: Partial<DraftZone>) => void;
  onZoneDelete: (zoneKey: string) => void;
  onTableChange: (
    zoneKey: string,
    tableKey: string,
    patch: Partial<DraftTable>,
  ) => void;
  onTableDelete: (zoneKey: string, tableKey: string) => void;
  onTableAdd: (zoneKey: string) => void;
  onTableDuplicate: (zoneKey: string, tableKey: string) => void;
  onGenerateTables: (
    zoneKey: string,
    options: {
      count: number;
      seats: number;
      shape: TableShape;
      hasChairs: boolean;
      replace: boolean;
    },
  ) => void;
  onGenerateSeats: (
    zoneKey: string,
    options: { rows: number; seatsPerRow: number },
  ) => void;
}

export function Inspector(props: InspectorProps) {
  const { floor, selection } = props;

  const zone = selection
    ? floor.zones.find((item) => item.key === selection.zoneKey)
    : undefined;
  const table =
    zone && selection?.kind === "table"
      ? zone.tables.find((item) => item.key === selection.tableKey)
      : undefined;

  if (table && zone) return <TablePanel {...props} zone={zone} table={table} />;
  if (zone) return <ZonePanel {...props} zone={zone} />;
  return <FloorPanel {...props} />;
}

function FloorPanel({ floor, onFloorChange, onSelect }: InspectorProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="font-semibold">Piso</h3>
        <p className="text-sm text-muted-foreground">
          Tocá una zona del plano para editarla.
        </p>
      </div>

      <Field label="Nombre del piso">
        <Input
          value={floor.name}
          maxLength={50}
          onChange={(event) => onFloorChange({ name: event.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Ancho del plano"
          value={floor.canvasWidth}
          min={200}
          max={10000}
          onChange={(canvasWidth) => onFloorChange({ canvasWidth })}
        />
        <NumberField
          label="Alto del plano"
          value={floor.canvasHeight}
          min={200}
          max={10000}
          onChange={(canvasHeight) => onFloorChange({ canvasHeight })}
        />
      </div>

      <div className="rounded-xl bg-muted/60 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Capacidad de este piso
        </p>
        <p className="text-2xl font-bold">
          {draftFloorCapacity(floor)} personas
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Zonas ({floor.zones.length})
        </Label>
        {floor.zones.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay zonas. Usá “Dibujar zona” y arrastrá sobre el plano.
          </p>
        )}
        {floor.zones.map((zone) => (
          <button
            key={zone.key}
            type="button"
            onClick={() => onSelect({ kind: "zone", zoneKey: zone.key })}
            className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary-soft"
          >
            <span className="flex items-center gap-2 truncate">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: zone.color }}
              />
              <span className="truncate">{zone.name}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {draftZoneCapacity(zone)} pers.
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ZonePanel({
  zone,
  soldZoneIds,
  onSelect,
  onZoneChange,
  onZoneDelete,
  onTableAdd,
  onGenerateTables,
  onGenerateSeats,
}: InspectorProps & { zone: DraftZone }) {
  const sold = Boolean(zone.id && soldZoneIds.has(zone.id));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Zona</h3>
          <p className="text-sm text-muted-foreground">
            {draftZoneCapacity(zone)} personas
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Cerrar
        </Button>
      </div>

      <Field label="Nombre">
        <Input
          value={zone.name}
          maxLength={50}
          onChange={(event) =>
            onZoneChange(zone.key, { name: event.target.value })
          }
        />
      </Field>

      <Field
        label="Tipo"
        hint={
          zone.type === "TABLES"
            ? "Mesas y lounges: se venden enteras o por lugar."
            : zone.type === "GENERAL"
              ? "Sin lugar asignado: solo aforo."
              : "Asientos numerados, fila por fila."
        }
      >
        <Select
          value={zone.type}
          onChange={(event) =>
            onZoneChange(zone.key, { type: event.target.value as ZoneType })
          }
        >
          {(Object.keys(ZONE_TYPE_LABELS) as ZoneType[]).map((type) => (
            <option key={type} value={type}>
              {ZONE_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {ZONE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              onClick={() => onZoneChange(zone.key, { color })}
              className={cn(
                "h-8 w-8 rounded-lg border-2 transition-transform",
                zone.color.toLowerCase() === color.toLowerCase()
                  ? "border-foreground scale-110"
                  : "border-transparent",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </Field>

      {zone.type === "GENERAL" && (
        <NumberField
          label="Aforo máximo"
          value={zone.capacity}
          min={1}
          max={100000}
          suffix="personas"
          onChange={(capacity) => onZoneChange(zone.key, { capacity })}
        />
      )}

      {zone.type === "TABLES" && (
        <TableTools
          zone={zone}
          onTableAdd={onTableAdd}
          onGenerate={onGenerateTables}
        />
      )}

      {zone.type === "SEATED" && (
        <SeatTools zone={zone} onGenerate={onGenerateSeats} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="X"
          value={zone.posX}
          onChange={(posX) => onZoneChange(zone.key, { posX })}
        />
        <NumberField
          label="Y"
          value={zone.posY}
          onChange={(posY) => onZoneChange(zone.key, { posY })}
        />
        <NumberField
          label="Ancho"
          value={zone.width}
          min={40}
          onChange={(width) => onZoneChange(zone.key, { width })}
        />
        <NumberField
          label="Alto"
          value={zone.height}
          min={40}
          onChange={(height) => onZoneChange(zone.key, { height })}
        />
        <NumberField
          label="Rotación"
          value={zone.rotation}
          min={0}
          max={359}
          suffix="°"
          onChange={(rotation) => onZoneChange(zone.key, { rotation })}
        />
      </div>

      {sold ? (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
          Esta zona ya tiene ventas: podés moverla o renombrarla, pero no
          borrarla.
        </p>
      ) : (
        <Button
          variant="danger"
          size="sm"
          onClick={() => onZoneDelete(zone.key)}
        >
          Eliminar zona
        </Button>
      )}
    </div>
  );
}

function TableTools({
  zone,
  onTableAdd,
  onGenerate,
}: {
  zone: DraftZone;
  onTableAdd: InspectorProps["onTableAdd"];
  onGenerate: InspectorProps["onGenerateTables"];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Mesas ({zone.tables.length})</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTableAdd(zone.key)}
        >
          + Mesa
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Generá varias de una y después movelas a mano.
      </p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onGenerate(zone.key, {
            count: Number(form.get("count")),
            seats: Number(form.get("seats")),
            shape: form.get("shape") as TableShape,
            hasChairs: form.get("hasChairs") === "on",
            replace: form.get("replace") === "on",
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Cantidad</Label>
            <Input
              className="h-10"
              type="number"
              name="count"
              defaultValue={6}
              min={1}
              max={200}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Capacidad c/u
            </Label>
            <Input
              className="h-10"
              type="number"
              name="seats"
              defaultValue={6}
              min={1}
              max={50}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Forma</Label>
          <Select className="h-10" name="shape" defaultValue="ROUND">
            {(Object.keys(SHAPE_LABELS) as TableShape[]).map((shape) => (
              <option key={shape} value={shape}>
                {SHAPE_LABELS[shape]}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="hasChairs"
            defaultChecked
            className="h-4 w-4"
          />
          Dibujar sillas alrededor
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="replace" className="h-4 w-4" />
          Reemplazar las mesas actuales
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Generar mesas
        </Button>
      </form>
    </div>
  );
}

function SeatTools({
  zone,
  onGenerate,
}: {
  zone: DraftZone;
  onGenerate: InspectorProps["onGenerateSeats"];
}) {
  const rows = new Set(zone.seats.map((seat) => seat.row)).size;
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onGenerate(zone.key, {
          rows: Number(form.get("rows")),
          seatsPerRow: Number(form.get("seatsPerRow")),
        });
      }}
    >
      <p className="text-sm font-semibold">
        Asientos ({zone.seats.length}
        {rows > 0 ? ` · ${rows} filas` : ""})
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Filas</Label>
          <Input
            className="h-10"
            type="number"
            name="rows"
            defaultValue={Math.max(1, rows)}
            min={1}
            max={26}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Por fila</Label>
          <Input
            className="h-10"
            type="number"
            name="seatsPerRow"
            defaultValue={rows > 0 ? Math.round(zone.seats.length / rows) : 10}
            min={1}
            max={99}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Regenera la grilla completa de esta zona (filas A, B, C…).
      </p>
      <Button type="submit" variant="secondary" size="sm">
        Regenerar asientos
      </Button>
    </form>
  );
}

function TablePanel({
  zone,
  table,
  onSelect,
  onTableChange,
  onTableDelete,
  onTableDuplicate,
}: InspectorProps & { zone: DraftZone; table: DraftTable }) {
  const patch = (values: Partial<DraftTable>) =>
    onTableChange(zone.key, table.key, values);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Mesa</h3>
          <p className="text-sm text-muted-foreground">en {zone.name}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelect({ kind: "zone", zoneKey: zone.key })}
        >
          Ver zona
        </Button>
      </div>

      <Field
        label="Etiqueta"
        hint="Es lo que ve el comprador: M4, Lounge 2, Box A…"
      >
        <Input
          value={table.label}
          maxLength={20}
          onChange={(event) => patch({ label: event.target.value })}
        />
      </Field>

      <NumberField
        label="Capacidad máxima"
        value={table.seats}
        min={1}
        max={50}
        suffix="personas"
        onChange={(seats) => patch({ seats })}
      />

      <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={table.hasChairs}
          onChange={(event) => patch({ hasChairs: event.target.checked })}
        />
        <span>
          Tiene sillas
          <span className="block text-xs text-muted-foreground">
            Sin sillas se dibuja como un lounge: solo el mueble y su capacidad.
          </span>
        </span>
      </label>

      <Field label="Forma">
        <Select
          value={table.shape}
          onChange={(event) =>
            patch({ shape: event.target.value as TableShape })
          }
        >
          {(Object.keys(SHAPE_LABELS) as TableShape[]).map((shape) => (
            <option key={shape} value={shape}>
              {SHAPE_LABELS[shape]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Ancho"
          value={table.width}
          min={10}
          max={600}
          onChange={(width) =>
            patch(
              table.shape === "ROUND" ? { width, height: width } : { width },
            )
          }
        />
        <NumberField
          label="Alto"
          value={table.height}
          min={10}
          max={600}
          onChange={(height) =>
            patch(
              table.shape === "ROUND" ? { width: height, height } : { height },
            )
          }
        />
        <NumberField
          label="X"
          value={table.posX}
          onChange={(posX) => patch({ posX })}
        />
        <NumberField
          label="Y"
          value={table.posY}
          onChange={(posY) => patch({ posY })}
        />
        <NumberField
          label="Rotación"
          value={table.rotation}
          min={0}
          max={359}
          suffix="°"
          onChange={(rotation) => patch({ rotation })}
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTableDuplicate(zone.key, table.key)}
        >
          Duplicar
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onTableDelete(zone.key, table.key)}
        >
          Eliminar
        </Button>
      </div>
    </div>
  );
}
