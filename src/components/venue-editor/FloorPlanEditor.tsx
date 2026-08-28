"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { seatGrid } from "@/lib/venue-zones";
import {
  clamp,
  generateTables,
  nextTableLabel,
  requiredZoneSize,
  snap,
} from "@/lib/venue-layout";
import type { TableShape } from "@/generated/prisma/enums";
import { Inspector } from "./Inspector";
import { PlanCanvas, type Selection } from "./PlanCanvas";
import {
  draftFloorCapacity,
  newKey,
  toDraftFloor,
  toLayoutPayload,
  ZONE_COLORS,
  type DraftFloor,
  type DraftTable,
  type DraftZone,
  type ServerFloor,
} from "./draft";

const ZOOM_STEPS = [0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];

export function FloorPlanEditor({
  venueId,
  floors: initialFloors,
  soldZoneIds,
}: {
  venueId: string;
  floors: ServerFloor[];
  soldZoneIds: string[];
}) {
  const router = useRouter();
  const [floors, setFloors] = useState<DraftFloor[]>(() =>
    initialFloors.map(toDraftFloor),
  );
  const [activeId, setActiveId] = useState(initialFloors[0]?.id ?? "");
  const [dirty, setDirty] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [drawing, setDrawing] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const [saving, setSaving] = useState(false);
  const [confirmFloorDelete, setConfirmFloorDelete] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const sold = useMemo(() => new Set(soldZoneIds), [soldZoneIds]);
  const floor = floors.find((item) => item.id === activeId) ?? floors[0];
  const isDirty = dirty.length > 0;

  const markDirty = useCallback((floorId: string) => {
    setDirty((current) =>
      current.includes(floorId) ? current : [...current, floorId],
    );
  }, []);

  const patchFloor = useCallback(
    (floorId: string, update: (floor: DraftFloor) => DraftFloor) => {
      setFloors((current) =>
        current.map((item) => (item.id === floorId ? update(item) : item)),
      );
      markDirty(floorId);
    },
    [markDirty],
  );

  const patchZone = useCallback(
    (zoneKey: string, patch: Partial<DraftZone>) => {
      patchFloor(activeId, (current) => ({
        ...current,
        zones: current.zones.map((zone) =>
          zone.key === zoneKey ? { ...zone, ...patch } : zone,
        ),
      }));
    },
    [activeId, patchFloor],
  );

  const patchTable = useCallback(
    (zoneKey: string, tableKey: string, patch: Partial<DraftTable>) => {
      patchFloor(activeId, (current) => ({
        ...current,
        zones: current.zones.map((zone) =>
          zone.key === zoneKey
            ? {
                ...zone,
                tables: zone.tables.map((table) =>
                  table.key === tableKey ? { ...table, ...patch } : table,
                ),
              }
            : zone,
        ),
      }));
    },
    [activeId, patchFloor],
  );

  // ---- creating things ----------------------------------------------------

  function addZone(rect: {
    posX: number;
    posY: number;
    width: number;
    height: number;
  }) {
    const zone: DraftZone = {
      key: newKey(),
      name: `Zona ${floor.zones.length + 1}`,
      type: "TABLES",
      description: null,
      color: ZONE_COLORS[floor.zones.length % ZONE_COLORS.length],
      capacity: 50,
      rotation: 0,
      tables: [],
      seats: [],
      ...rect,
    };
    patchFloor(activeId, (current) => ({
      ...current,
      zones: [...current.zones, zone],
    }));
    setSelection({ kind: "zone", zoneKey: zone.key });
    setDrawing(false);
  }

  function deleteZone(zoneKey: string) {
    const zone = floor.zones.find((item) => item.key === zoneKey);
    if (zone?.id && sold.has(zone.id)) {
      toast.error("Esa zona ya tiene ventas: no se puede eliminar.");
      return;
    }
    patchFloor(activeId, (current) => ({
      ...current,
      zones: current.zones.filter((item) => item.key !== zoneKey),
    }));
    setSelection(null);
  }

  function addTable(zoneKey: string) {
    const zone = floor.zones.find((item) => item.key === zoneKey);
    if (!zone) return;
    // Continue the grid: lay out one more table than there are and keep the last
    const laid = generateTables({
      count: zone.tables.length + 1,
      seats: 6,
      shape: "ROUND",
      hasChairs: true,
      zoneWidth: zone.width,
    });
    const spot = laid.at(-1)!;
    const table: DraftTable = {
      key: newKey(),
      label: nextTableLabel(zone.tables.map((item) => item.label)),
      seats: 6,
      hasChairs: true,
      shape: "ROUND",
      posX: clamp(spot.posX, 0, Math.max(0, zone.width - spot.width)),
      posY: clamp(spot.posY, 0, Math.max(0, zone.height - spot.height)),
      width: spot.width,
      height: spot.height,
      rotation: 0,
    };
    patchZone(zoneKey, { tables: [...zone.tables, table] });
    setSelection({ kind: "table", zoneKey, tableKey: table.key });
  }

  function duplicateTable(zoneKey: string, tableKey: string) {
    const zone = floor.zones.find((item) => item.key === zoneKey);
    const source = zone?.tables.find((item) => item.key === tableKey);
    if (!zone || !source) return;
    const copy: DraftTable = {
      ...source,
      key: newKey(),
      id: undefined,
      label: nextTableLabel(zone.tables.map((item) => item.label)),
      posX: clamp(
        source.posX + source.width + 20,
        0,
        Math.max(0, zone.width - source.width),
      ),
    };
    patchZone(zoneKey, { tables: [...zone.tables, copy] });
    setSelection({ kind: "table", zoneKey, tableKey: copy.key });
  }

  function deleteTable(zoneKey: string, tableKey: string) {
    const zone = floor.zones.find((item) => item.key === zoneKey);
    if (!zone) return;
    patchZone(zoneKey, {
      tables: zone.tables.filter((table) => table.key !== tableKey),
    });
    setSelection({ kind: "zone", zoneKey });
  }

  function bulkTables(
    zoneKey: string,
    options: {
      count: number;
      seats: number;
      shape: TableShape;
      hasChairs: boolean;
      replace: boolean;
    },
  ) {
    const zone = floor.zones.find((item) => item.key === zoneKey);
    if (!zone) return;
    if (!Number.isFinite(options.count) || options.count < 1) return;

    const kept = options.replace ? [] : zone.tables;
    const blocked = options.replace
      ? zone.tables.filter((table) => table.id && sold.has(zone.id ?? ""))
      : [];
    if (blocked.length > 0) {
      toast.error("Esta zona tiene ventas: no podés reemplazar sus mesas.");
      return;
    }

    // Lay out the whole grid and take the tail, so the new tables continue
    // where the existing ones left off instead of landing on top of them.
    const laid = generateTables({
      count: kept.length + options.count,
      seats: options.seats,
      shape: options.shape,
      hasChairs: options.hasChairs,
      zoneWidth: zone.width,
      startAt: 1,
    }).slice(kept.length);

    const existingLabels = kept.map((table) => table.label);
    const fresh: DraftTable[] = laid.map((spot) => {
      const label = nextTableLabel(existingLabels);
      existingLabels.push(label);
      return { ...spot, label, key: newKey() };
    });

    const tables = [...kept, ...fresh];
    const size = requiredZoneSize(tables);
    patchZone(zoneKey, {
      tables,
      width: Math.max(zone.width, size.width),
      height: Math.max(zone.height, size.height),
    });
    setSelection({ kind: "zone", zoneKey });
  }

  function bulkSeats(
    zoneKey: string,
    { rows, seatsPerRow }: { rows: number; seatsPerRow: number },
  ) {
    const zone = floor.zones.find((item) => item.key === zoneKey);
    if (!zone) return;
    if (zone.id && sold.has(zone.id)) {
      toast.error("Esta zona tiene ventas: no podés regenerar sus asientos.");
      return;
    }
    if (!Number.isFinite(rows) || !Number.isFinite(seatsPerRow)) return;

    const seats = seatGrid(
      clamp(Math.round(rows), 1, 26),
      clamp(Math.round(seatsPerRow), 1, 99),
    ).map((seat) => ({ ...seat, key: newKey() }));

    patchZone(zoneKey, {
      seats,
      width: Math.max(
        zone.width,
        snap(10 + clamp(seatsPerRow, 1, 99) * 28 + 10),
      ),
      height: Math.max(zone.height, snap(10 + clamp(rows, 1, 26) * 28 + 10)),
    });
  }

  // ---- floors -------------------------------------------------------------

  async function addFloor() {
    const name = `Piso ${floors.length + 1}`;
    const response = await fetch(`/api/venues/${venueId}/floors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, canvasWidth: 1000, canvasHeight: 700 }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error ?? "No se pudo agregar el piso");
      return;
    }
    const draft = toDraftFloor({ ...data.floor, zones: [] });
    setFloors((current) => [...current, draft]);
    setActiveId(draft.id);
    setSelection(null);
    toast.success(`${name} agregado`);
  }

  async function deleteFloor() {
    const response = await fetch(`/api/venues/${venueId}/floors/${floor.id}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return data.error ?? "No se pudo eliminar el piso";

    setFloors((current) => current.filter((item) => item.id !== floor.id));
    setDirty((current) => current.filter((id) => id !== floor.id));
    setActiveId(floors.find((item) => item.id !== floor.id)!.id);
    setSelection(null);
    setConfirmFloorDelete(false);
    toast.success("Piso eliminado");
    router.refresh();
    return null;
  }

  // ---- saving -------------------------------------------------------------

  async function save() {
    if (saving || !isDirty) return;
    setSaving(true);
    const pending = floors.filter((item) => dirty.includes(item.id));

    for (const item of pending) {
      const response = await fetch(
        `/api/venues/${venueId}/floors/${item.id}/layout`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toLayoutPayload(item)),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaving(false);
        toast.error(
          data.blocked?.length
            ? `${data.error} (${data.blocked.join(", ")})`
            : (data.error ?? "No se pudo guardar el plano"),
        );
        return;
      }
      // Adopt the ids the server just handed out, so the next save is a diff
      // and not a second round of inserts.
      setFloors((current) =>
        current.map((existing) =>
          existing.id === item.id ? toDraftFloor(data.floor) : existing,
        ),
      );
      setSelection(null);
    }

    setDirty([]);
    setSaving(false);
    toast.success(pending.length > 1 ? "Planos guardados" : "Plano guardado");
    router.refresh();
  }

  // ---- keyboard -----------------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.key === "Escape") {
        setDrawing(false);
        setSelection(null);
        return;
      }
      if (!selection) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (selection.kind === "table") {
          deleteTable(selection.zoneKey, selection.tableKey);
        } else {
          deleteZone(selection.zoneKey);
        }
        return;
      }

      const step = event.shiftKey ? 50 : 10;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = nudge[event.key];
      if (!move) return;
      event.preventDefault();

      const zone = floor.zones.find((item) => item.key === selection.zoneKey);
      if (!zone) return;
      if (selection.kind === "zone") {
        patchZone(zone.key, {
          posX: clamp(zone.posX + move[0], 0, floor.canvasWidth - zone.width),
          posY: clamp(zone.posY + move[1], 0, floor.canvasHeight - zone.height),
        });
        return;
      }
      const table = zone.tables.find((item) => item.key === selection.tableKey);
      if (!table) return;
      patchTable(zone.key, table.key, {
        posX: clamp(
          table.posX + move[0],
          0,
          Math.max(0, zone.width - table.width),
        ),
        posY: clamp(
          table.posY + move[1],
          0,
          Math.max(0, zone.height - table.height),
        ),
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Closing the tab mid-edit would lose the plan silently
  useEffect(() => {
    if (!isDirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function fitZoom() {
    const width = shellRef.current?.clientWidth;
    if (!width) return;
    setZoom(
      clamp(Number(((width - 32) / floor.canvasWidth).toFixed(2)), 0.3, 2),
    );
  }

  if (!floor) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {floors.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveId(item.id);
                setSelection(null);
              }}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                item.id === floor.id
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              {item.name}
              {dirty.includes(item.id) && (
                <span className="ml-1.5 text-gold" aria-label="Sin guardar">
                  •
                </span>
              )}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={addFloor}>
            + Piso
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {floors.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmFloorDelete(true)}
            >
              Eliminar piso
            </Button>
          )}
          <Button onClick={save} disabled={!isDirty || saving} size="sm">
            {saving ? "Guardando…" : isDirty ? "Guardar plano" : "Guardado"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
        <Button
          variant={drawing ? "primary" : "outline"}
          size="sm"
          onClick={() => {
            setDrawing((current) => !current);
            setSelection(null);
          }}
        >
          {drawing ? "Dibujando zona…" : "Dibujar zona"}
        </Button>
        {selection && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => addTable(selection.zoneKey)}
          >
            + Mesa
          </Button>
        )}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setZoom((current) => {
              const index = ZOOM_STEPS.findIndex((step) => step >= current);
              return ZOOM_STEPS[Math.max(0, index - 1)];
            })
          }
        >
          −
        </Button>
        <span className="w-12 text-center text-sm tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setZoom((current) => {
              const index = ZOOM_STEPS.findIndex((step) => step > current);
              return index === -1 ? current : ZOOM_STEPS[index];
            })
          }
        >
          +
        </Button>
        <Button variant="ghost" size="sm" onClick={fitZoom}>
          Ajustar
        </Button>
        <span className="ml-auto px-2 text-sm text-muted-foreground">
          {draftFloorCapacity(floor)} personas en {floor.name.toLowerCase()}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={shellRef} className="min-w-0">
          <PlanCanvas
            floor={floor}
            selection={selection}
            onSelect={setSelection}
            onZoneChange={patchZone}
            onTableChange={patchTable}
            onDrawZone={addZone}
            drawing={drawing}
            zoom={zoom}
            soldZoneIds={sold}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Arrastrá para mover · esquina inferior derecha para redimensionar ·
            flechas para ajustar · Supr para eliminar
          </p>
        </div>

        <aside className="rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
          <Inspector
            floor={floor}
            selection={selection}
            soldZoneIds={sold}
            onSelect={setSelection}
            onFloorChange={(patch) =>
              patchFloor(activeId, (current) => ({ ...current, ...patch }))
            }
            onZoneChange={patchZone}
            onZoneDelete={deleteZone}
            onTableChange={patchTable}
            onTableDelete={deleteTable}
            onTableAdd={addTable}
            onTableDuplicate={duplicateTable}
            onGenerateTables={bulkTables}
            onGenerateSeats={bulkSeats}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmFloorDelete}
        onClose={() => setConfirmFloorDelete(false)}
        title={`¿Eliminar ${floor.name}?`}
        description="Se borran sus zonas y mesas. No se puede deshacer."
        confirmLabel="Eliminar piso"
        tone="danger"
        onConfirm={deleteFloor}
      />
    </div>
  );
}
