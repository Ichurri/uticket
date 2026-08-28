"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Select } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { cn, formatCurrency } from "@/lib/utils";
import { inclusionSummary } from "@/lib/order-items";
import type { PricingZoneDto } from "@/lib/event-pricing";
import type { InclusionType, SaleStatus } from "@/generated/prisma/enums";

const INCLUSION_LABELS: Record<InclusionType, string> = {
  NONE: "Solo el lugar",
  ENTRY_ONLY: "Solo entrada, sin consumo",
  CONSUMPTION_CREDIT: "Consumo incluido",
  BOTTLE: "Botella incluida",
  CUSTOM: "Otro (lo describo)",
};

const STATUS_LABELS: Record<SaleStatus, string> = {
  AVAILABLE: "Libre",
  HELD: "Reservada",
  SOLD: "Vendida",
  BLOCKED: "Bloqueada",
};

/** Form state: every field is a string, the way inputs want it. */
interface TableState {
  eventTableId: string;
  tableId: string;
  label: string;
  seats: number;
  hasChairs: boolean;
  status: SaleStatus;
  seatsSold: number;
  price: string;
  seatPrice: string;
  inclusionType: InclusionType | "";
  inclusionValue: string;
  inclusionNote: string;
  blocked: boolean;
}

interface ZoneState {
  eventZoneId: string;
  zoneId: string;
  zoneName: string;
  floorName: string;
  type: PricingZoneDto["type"];
  zoneCapacity: number | null;
  seatCount: number;
  price: string;
  isEnabled: boolean;
  capacityForSale: string;
  tableSaleMode: "WHOLE_TABLE" | "PER_SEAT";
  seatPrice: string;
  defaultInclusionType: InclusionType;
  defaultInclusionValue: string;
  defaultInclusionNote: string;
  salesStartAt: string;
  salesEndAt: string;
  tables: TableState[];
}

const text = (value: number | string | null) =>
  value === null || value === undefined ? "" : String(value);

function toState(zone: PricingZoneDto): ZoneState {
  return {
    eventZoneId: zone.eventZoneId,
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    floorName: zone.floorName,
    type: zone.type,
    zoneCapacity: zone.zoneCapacity,
    seatCount: zone.seatCount,
    price: text(zone.price),
    isEnabled: zone.isEnabled,
    capacityForSale: text(zone.capacityForSale),
    tableSaleMode: zone.tableSaleMode,
    seatPrice: text(zone.seatPrice),
    defaultInclusionType: zone.defaultInclusionType,
    defaultInclusionValue: text(zone.defaultInclusionValue),
    defaultInclusionNote: text(zone.defaultInclusionNote),
    salesStartAt: zone.salesStartAt ?? "",
    salesEndAt: zone.salesEndAt ?? "",
    tables: zone.tables.map((table) => ({
      eventTableId: table.eventTableId,
      tableId: table.tableId,
      label: table.label,
      seats: table.seats,
      hasChairs: table.hasChairs,
      status: table.status,
      seatsSold: table.seatsSold,
      price: text(table.price),
      seatPrice: text(table.seatPrice),
      inclusionType: table.inclusionType ?? "",
      inclusionValue: text(table.inclusionValue),
      inclusionNote: text(table.inclusionNote),
      blocked: table.status === "BLOCKED",
    })),
  };
}

/** What a zone would bring in if it sold out at these prices. */
function zoneRevenue(zone: ZoneState) {
  const price = Number(zone.price) || 0;
  if (zone.type === "TABLES") {
    return zone.tables.reduce((sum, table) => {
      if (table.blocked) return sum;
      if (zone.tableSaleMode === "PER_SEAT") {
        const seat =
          Number(table.seatPrice) || Number(zone.seatPrice) || price;
        return sum + seat * table.seats;
      }
      return sum + (Number(table.price) || price);
    }, 0);
  }
  if (zone.type === "SEATED") return price * zone.seatCount;
  return price * (Number(zone.capacityForSale) || zone.zoneCapacity || 0);
}

function zoneSeats(zone: ZoneState) {
  if (zone.type === "TABLES") {
    return zone.tables.reduce(
      (sum, table) => sum + (table.blocked ? 0 : table.seats),
      0,
    );
  }
  if (zone.type === "SEATED") return zone.seatCount;
  return Number(zone.capacityForSale) || zone.zoneCapacity || 0;
}

export function PricingForm({
  eventId,
  zones: initial,
  sources,
}: {
  eventId: string;
  zones: PricingZoneDto[];
  /** Other events at the same venue, to copy a setup from */
  sources: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [zones, setZones] = useState<ZoneState[]>(() => initial.map(toState));
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [issues, setIssues] = useState<string[]>([]);

  const multiFloor = useMemo(
    () => new Set(initial.map((zone) => zone.floorName)).size > 1,
    [initial],
  );

  const totals = useMemo(() => {
    const enabled = zones.filter((zone) => zone.isEnabled);
    return {
      seats: enabled.reduce((sum, zone) => sum + zoneSeats(zone), 0),
      revenue: enabled.reduce((sum, zone) => sum + zoneRevenue(zone), 0),
    };
  }, [zones]);

  function patchZone(eventZoneId: string, patch: Partial<ZoneState>) {
    setZones((current) =>
      current.map((zone) =>
        zone.eventZoneId === eventZoneId ? { ...zone, ...patch } : zone,
      ),
    );
  }

  function patchTable(
    eventZoneId: string,
    eventTableId: string,
    patch: Partial<TableState>,
  ) {
    setZones((current) =>
      current.map((zone) =>
        zone.eventZoneId === eventZoneId
          ? {
              ...zone,
              tables: zone.tables.map((table) =>
                table.eventTableId === eventTableId
                  ? { ...table, ...patch }
                  : table,
              ),
            }
          : zone,
      ),
    );
  }

  /**
   * Copy another event's setup. Matched by the PHYSICAL row — same zone, same
   * table — because that is what the two events share; the commercial ids are
   * different on each side.
   */
  async function copyFromEvent() {
    if (!copyFrom || copying) return;
    setCopying(true);
    const response = await fetch(`/api/events/${copyFrom}/pricing`);
    const data = await response.json().catch(() => ({}));
    setCopying(false);
    if (!response.ok) {
      toast.error(data.error ?? "No se pudo leer ese evento");
      return;
    }

    const byZone = new Map<string, PricingZoneDto>(
      (data.zones as PricingZoneDto[]).map((zone) => [zone.zoneId, zone]),
    );
    let matched = 0;

    setZones((current) =>
      current.map((zone) => {
        const source = byZone.get(zone.zoneId);
        if (!source) return zone;
        matched++;
        const sourceTables = new Map(
          source.tables.map((table) => [table.tableId, table]),
        );
        return {
          ...zone,
          price: text(source.price),
          isEnabled: source.isEnabled,
          capacityForSale: text(source.capacityForSale),
          tableSaleMode: source.tableSaleMode,
          seatPrice: text(source.seatPrice),
          defaultInclusionType: source.defaultInclusionType,
          defaultInclusionValue: text(source.defaultInclusionValue),
          defaultInclusionNote: text(source.defaultInclusionNote),
          // Deliberately NOT copied: the sales window belongs to that event's
          // dates, and copying it would open or close this one at the wrong time.
          tables: zone.tables.map((table) => {
            const from = sourceTables.get(table.tableId);
            if (!from) return table;
            return {
              ...table,
              price: text(from.price),
              seatPrice: text(from.seatPrice),
              inclusionType: from.inclusionType ?? "",
              inclusionValue: text(from.inclusionValue),
              inclusionNote: text(from.inclusionNote),
            };
          }),
        };
      }),
    );

    toast.success(
      matched > 0
        ? `Se copiaron ${matched} zona${matched === 1 ? "" : "s"}. Revisá y guardá.`
        : "Ese evento no comparte zonas con este",
    );
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setIssues([]);

    const payload = {
      zones: zones.map((zone) => ({
        eventZoneId: zone.eventZoneId,
        price: zone.price,
        isEnabled: zone.isEnabled,
        capacityForSale: zone.type === "GENERAL" ? zone.capacityForSale : "",
        tableSaleMode: zone.tableSaleMode,
        seatPrice: zone.tableSaleMode === "PER_SEAT" ? zone.seatPrice : "",
        defaultInclusionType: zone.defaultInclusionType,
        defaultInclusionValue: zone.defaultInclusionValue,
        defaultInclusionNote: zone.defaultInclusionNote,
        salesStartAt: zone.salesStartAt,
        salesEndAt: zone.salesEndAt,
        tables: zone.tables.map((table) => ({
          eventTableId: table.eventTableId,
          price: table.price,
          seatPrice: table.seatPrice,
          inclusionType: table.inclusionType === "" ? undefined : table.inclusionType,
          inclusionValue: table.inclusionValue,
          inclusionNote: table.inclusionNote,
          blocked: table.blocked,
        })),
      })),
    };

    const response = await fetch(`/api/events/${eventId}/pricing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      const fieldIssues = data.issues
        ? Object.values(data.issues).flat().map(String)
        : [];
      setIssues(data.conflicts ?? fieldIssues);
      toast.error(data.error ?? "No se pudieron guardar los precios");
      return;
    }

    setZones((data.zones as PricingZoneDto[]).map(toState));
    if (data.skipped?.length > 0) {
      toast.warning(
        `No se bloquearon mesas ya tomadas: ${data.skipped.join(", ")}`,
      );
    } else {
      toast.success("Precios guardados");
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {sources.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Copiar precios de otro evento en este venue
              </Label>
              <Select
                value={copyFrom}
                onChange={(event) => setCopyFrom(event.target.value)}
              >
                <option value="">Elegí un evento…</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.title}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={copyFromEvent}
              disabled={!copyFrom || copying}
            >
              {copying ? "Copiando…" : "Copiar"}
            </Button>
          </CardContent>
        </Card>
      )}

      {issues.length > 0 && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          <ul className="list-inside list-disc space-y-1">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {zones.map((zone) => (
        <ZoneCard
          key={zone.eventZoneId}
          zone={zone}
          showFloor={multiFloor}
          onChange={(patch) => patchZone(zone.eventZoneId, patch)}
          onTableChange={(tableId, patch) =>
            patchTable(zone.eventZoneId, tableId, patch)
          }
        />
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-4 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Si se vende todo
          </p>
          <p className="text-xl font-bold">
            {formatCurrency(totals.revenue)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {totals.seats} personas
            </span>
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar precios"}
        </Button>
      </div>
    </div>
  );
}

function ZoneCard({
  zone,
  showFloor,
  onChange,
  onTableChange,
}: {
  zone: ZoneState;
  showFloor: boolean;
  onChange: (patch: Partial<ZoneState>) => void;
  onTableChange: (eventTableId: string, patch: Partial<TableState>) => void;
}) {
  const [showWindow, setShowWindow] = useState(
    Boolean(zone.salesStartAt || zone.salesEndAt),
  );

  return (
    <Card className={cn(!zone.isEnabled && "opacity-60")}>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{zone.zoneName}</h2>
              <Badge variant={zone.type === "TABLES" ? "primary" : "default"}>
                {zone.type === "TABLES"
                  ? "Mesas"
                  : zone.type === "SEATED"
                    ? "Numerada"
                    : "General"}
              </Badge>
              {showFloor && (
                <span className="text-xs text-muted-foreground">
                  {zone.floorName}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {zoneSeats(zone)} personas · {formatCurrency(zoneRevenue(zone))} si
              se vende todo
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={zone.isEnabled}
              onChange={(event) => onChange({ isEnabled: event.target.checked })}
            />
            A la venta
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>
              {zone.type === "TABLES" ? "Precio por mesa (Bs)" : "Precio (Bs)"}
            </Label>
            <Input
              type="number"
              min={1}
              step="0.01"
              value={zone.price}
              onChange={(event) => onChange({ price: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {zone.type === "SEATED"
                ? "Se aplica a cada asiento de la zona."
                : zone.type === "TABLES"
                  ? "Base para todas las mesas; cada una puede tener el suyo."
                  : "Precio de cada entrada."}
            </p>
          </div>

          {zone.type === "GENERAL" && (
            <div className="flex flex-col gap-1.5">
              <Label>Entradas a la venta</Label>
              <Input
                type="number"
                min={1}
                placeholder={String(zone.zoneCapacity ?? "")}
                value={zone.capacityForSale}
                onChange={(event) =>
                  onChange({ capacityForSale: event.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Vacío = todo el aforo ({zone.zoneCapacity ?? 0}). Ponés menos
                para guardar entradas.
              </p>
            </div>
          )}
        </div>

        {zone.type === "TABLES" && (
          <TableZoneFields
            zone={zone}
            onChange={onChange}
            onTableChange={onTableChange}
          />
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowWindow((current) => !current)}
            className="self-start text-sm font-medium text-primary"
          >
            {showWindow ? "Ocultar" : "Definir"} ventana de venta
          </button>
          {showWindow && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Abre (hora de Bolivia)
                </Label>
                <Input
                  type="datetime-local"
                  value={zone.salesStartAt}
                  onChange={(event) =>
                    onChange({ salesStartAt: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  Cierra (hora de Bolivia)
                </Label>
                <Input
                  type="datetime-local"
                  value={zone.salesEndAt}
                  onChange={(event) =>
                    onChange({ salesEndAt: event.target.value })
                  }
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TableZoneFields({
  zone,
  onChange,
  onTableChange,
}: {
  zone: ZoneState;
  onChange: (patch: Partial<ZoneState>) => void;
  onTableChange: (eventTableId: string, patch: Partial<TableState>) => void;
}) {
  const perSeat = zone.tableSaleMode === "PER_SEAT";
  const summary = inclusionSummary({
    inclusionType: zone.defaultInclusionType,
    inclusionValue: Number(zone.defaultInclusionValue) || null,
    inclusionNote: zone.defaultInclusionNote || null,
  });

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Cómo se venden</Label>
          <Select
            value={zone.tableSaleMode}
            onChange={(event) =>
              onChange({
                tableSaleMode: event.target.value as ZoneState["tableSaleMode"],
              })
            }
          >
            <option value="WHOLE_TABLE">Mesa entera (un comprador)</option>
            <option value="PER_SEAT">Por lugar (se comparte)</option>
          </Select>
        </div>

        {perSeat && (
          <div className="flex flex-col gap-1.5">
            <Label>Precio por lugar (Bs)</Label>
            <Input
              type="number"
              min={1}
              step="0.01"
              value={zone.seatPrice}
              onChange={(event) => onChange({ seatPrice: event.target.value })}
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Qué incluye</Label>
          <Select
            value={zone.defaultInclusionType}
            onChange={(event) =>
              onChange({
                defaultInclusionType: event.target.value as InclusionType,
              })
            }
          >
            {(Object.keys(INCLUSION_LABELS) as InclusionType[]).map((type) => (
              <option key={type} value={type}>
                {INCLUSION_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>

        {zone.defaultInclusionType === "CONSUMPTION_CREDIT" && (
          <div className="flex flex-col gap-1.5">
            <Label>Consumo incluido (Bs)</Label>
            <Input
              type="number"
              min={1}
              step="0.01"
              value={zone.defaultInclusionValue}
              onChange={(event) =>
                onChange({ defaultInclusionValue: event.target.value })
              }
            />
          </div>
        )}

        {(zone.defaultInclusionType === "BOTTLE" ||
          zone.defaultInclusionType === "CUSTOM") && (
          <div className="flex flex-col gap-1.5">
            <Label>Descripción</Label>
            <Input
              maxLength={200}
              placeholder="1 botella nacional + 4 mixers"
              value={zone.defaultInclusionNote}
              onChange={(event) =>
                onChange({ defaultInclusionNote: event.target.value })
              }
            />
          </div>
        )}
      </div>

      {summary && (
        <p className="text-sm text-muted-foreground">
          El comprador va a leer: <strong>{summary}</strong>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Mesas ({zone.tables.length})
        </p>
        {zone.tables.map((table) => (
          <div
            key={table.eventTableId}
            className={cn(
              "grid items-center gap-2 rounded-xl border border-border p-3",
              "sm:grid-cols-[minmax(0,1fr)_120px_auto]",
              table.blocked && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {table.label}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {table.seats} {table.hasChairs ? "sillas" : "personas"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {STATUS_LABELS[table.status]}
                {perSeat && table.seatsSold > 0
                  ? ` · ${table.seatsSold}/${table.seats} lugares tomados`
                  : ""}
              </p>
            </div>

            <Input
              className="h-10"
              type="number"
              min={1}
              step="0.01"
              placeholder={perSeat ? zone.seatPrice || zone.price : zone.price}
              value={perSeat ? table.seatPrice : table.price}
              onChange={(event) =>
                onTableChange(
                  table.eventTableId,
                  perSeat
                    ? { seatPrice: event.target.value }
                    : { price: event.target.value },
                )
              }
              aria-label={`Precio de ${table.label}`}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={table.blocked}
                disabled={table.status === "SOLD" || table.status === "HELD"}
                onChange={(event) =>
                  onTableChange(table.eventTableId, {
                    blocked: event.target.checked,
                  })
                }
              />
              No vender
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
