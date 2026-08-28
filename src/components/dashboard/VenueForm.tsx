"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label, Select, Textarea, FieldError } from "@/components/ui/Input";
import { venueSchema } from "@/lib/validations/venue";
import { seatGrid, tableGrid, ZONE_TYPE_LABELS } from "@/lib/venue-zones";
import { parseCoordinates, isShortMapsLink } from "@/lib/venue-location";

type ZoneTypeDraft = "GENERAL" | "TABLES" | "SEATED";

interface ZoneDraft {
  name: string;
  type: ZoneTypeDraft;
  color: string;
  /** GENERAL */
  capacity: string;
  /** TABLES — the generator inputs; the tables themselves are derived */
  tableCount: string;
  seatsPerTable: string;
  /** SEATED */
  rows: string;
  seatsPerRow: string;
}

interface FloorDraft {
  name: string;
  zones: ZoneDraft[];
}

export interface VenueFormInitial {
  id: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  googleMapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  isPublic: boolean;
  floors: FloorDraft[];
  /** Layout is frozen once anything has been sold for it */
  locked: boolean;
}

const emptyZone: ZoneDraft = {
  name: "",
  type: "GENERAL",
  color: "#6366f1",
  capacity: "100",
  tableCount: "8",
  seatsPerTable: "6",
  rows: "5",
  seatsPerRow: "10",
};

/** Zones are laid out on an automatic grid here; the visual editor comes later. */
const ZONE_COL_W = 220;
const ZONE_ROW_H = 170;
const ZONES_PER_ROW = 4;

function zoneCapacity(zone: ZoneDraft): number {
  if (zone.type === "TABLES") {
    return (Number(zone.tableCount) || 0) * (Number(zone.seatsPerTable) || 0);
  }
  if (zone.type === "SEATED") {
    return (Number(zone.rows) || 0) * (Number(zone.seatsPerRow) || 0);
  }
  return Number(zone.capacity) || 0;
}

/** Draft → the shape the API validates, geometry included. */
function toZonePayload(zone: ZoneDraft, index: number) {
  const posX = (index % ZONES_PER_ROW) * ZONE_COL_W;
  const posY = Math.floor(index / ZONES_PER_ROW) * ZONE_ROW_H;
  const base = {
    name: zone.name,
    type: zone.type,
    color: zone.color,
    order: index,
    posX,
    posY,
    rotation: 0,
  };

  if (zone.type === "TABLES") {
    const tables = tableGrid(
      Number(zone.tableCount) || 0,
      Number(zone.seatsPerTable) || 0,
    );
    const cols = Math.min(3, tables.length || 1);
    const rows = Math.ceil((tables.length || 1) / 3);
    return {
      ...base,
      width: cols * 80 + 20,
      height: rows * 80 + 20,
      tables,
    };
  }

  if (zone.type === "SEATED") {
    const seats = seatGrid(
      Number(zone.rows) || 0,
      Number(zone.seatsPerRow) || 0,
    );
    return {
      ...base,
      width: (Number(zone.seatsPerRow) || 0) * 28 + 20,
      height: (Number(zone.rows) || 0) * 28 + 20,
      seats,
    };
  }

  return { ...base, width: 200, height: 150, capacity: zone.capacity };
}

export function VenueForm({ initial }: { initial?: VenueFormInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [googleMapsUrl, setGoogleMapsUrl] = useState(
    initial?.googleMapsUrl ?? "",
  );
  const [latitude, setLatitude] = useState(
    initial?.latitude != null ? String(initial.latitude) : "",
  );
  const [longitude, setLongitude] = useState(
    initial?.longitude != null ? String(initial.longitude) : "",
  );
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false);
  const [floors, setFloors] = useState<FloorDraft[]>(
    initial?.floors ?? [
      { name: "Planta baja", zones: [{ ...emptyZone, name: "General" }] },
    ],
  );
  const [activeFloor, setActiveFloor] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const locked = initial?.locked ?? false;
  const totalCapacity = floors.reduce(
    (sum, floor) =>
      sum + floor.zones.reduce((s, zone) => s + zoneCapacity(zone), 0),
    0,
  );

  // Coordinates we could read right here; a short link only resolves server-side
  const parsedCoords = googleMapsUrl ? parseCoordinates(googleMapsUrl) : null;
  const needsManualCoords =
    googleMapsUrl.trim().length > 0 &&
    !parsedCoords &&
    !isShortMapsLink(googleMapsUrl);

  const floor = floors[activeFloor] ?? floors[0];

  function updateFloor(index: number, patch: Partial<FloorDraft>) {
    setFloors((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function updateZone(zoneIndex: number, patch: Partial<ZoneDraft>) {
    updateFloor(activeFloor, {
      zones: floor.zones.map((zone, i) =>
        i === zoneIndex ? { ...zone, ...patch } : zone,
      ),
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = {
      name,
      description: description || null,
      address,
      city,
      googleMapsUrl: googleMapsUrl || null,
      latitude: latitude === "" ? null : latitude,
      longitude: longitude === "" ? null : longitude,
      isPublic,
      floors: floors.map((item, index) => ({
        name: item.name,
        order: index,
        canvasWidth: 1000,
        canvasHeight: 700,
        zones: item.zones.map(toZonePayload),
      })),
    };

    const parsed = venueSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Revisá los datos del formulario",
      );
      return;
    }

    setLoading(true);
    const response = await fetch(
      initial ? `/api/venues/${initial.id}` : "/api/venues",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setFormError(data?.error ?? "No se pudo guardar el venue");
      return;
    }

    router.push("/dashboard/venues");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="venue-name">Nombre del venue</Label>
            <Input
              id="venue-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Teatro Municipal"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="venue-description">Descripción (opcional)</Label>
            <Textarea
              id="venue-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sala con capacidad para 300 personas, estacionamiento propio…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="venue-address">Dirección</Label>
            <Input
              id="venue-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle Genaro Sanjinés 629"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="venue-city">Ciudad</Label>
            <Input
              id="venue-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="La Paz"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="venue-maps">Link de Google Maps</Label>
            <Input
              id="venue-maps"
              value={googleMapsUrl}
              onChange={(e) => setGoogleMapsUrl(e.target.value)}
              placeholder="Pegá el link de Google Maps del lugar"
            />
            <p className="text-xs text-muted-foreground">
              {parsedCoords
                ? `Ubicación detectada: ${parsedCoords.latitude.toFixed(5)}, ${parsedCoords.longitude.toFixed(5)}`
                : isShortMapsLink(googleMapsUrl)
                  ? "Link corto: vamos a resolverlo al guardar."
                  : "Se usa para el botón «Cómo llegar» y para el mapa."}
            </p>
          </div>

          {needsManualCoords && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venue-lat">Latitud</Label>
                <Input
                  id="venue-lat"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="-16.4957"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venue-lng">Longitud</Label>
                <Input
                  id="venue-lng"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="-68.1335"
                />
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  No pudimos leer la ubicación del link. Podés cargarla a mano o
                  dejarla vacía.
                </p>
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[var(--primary)]"
            />
            Permitir que otros organizadores hagan eventos acá
          </label>
        </CardContent>
      </Card>

      {locked && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Este venue ya tiene ventas: podés editar sus datos, pero la
            distribución quedó bloqueada.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Distribución</h2>
          <p className="text-sm text-muted-foreground">
            Capacidad total: {totalCapacity} personas
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked || floors.length >= 10}
          onClick={() => {
            setFloors((current) => [
              ...current,
              { name: `Piso ${current.length + 1}`, zones: [{ ...emptyZone }] },
            ]);
            setActiveFloor(floors.length);
          }}
        >
          + Agregar piso
        </Button>
      </div>

      {/* One flat room is the common case: don't show a tab bar for a single
          floor, just the discreet "add" button above. */}
      {floors.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {floors.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveFloor(index)}
              className={`min-h-11 rounded-lg px-3.5 text-sm font-medium transition-colors ${
                index === activeFloor
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {floors.length > 1 && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="floor-name">Nombre del piso</Label>
            <Input
              id="floor-name"
              value={floor.name}
              disabled={locked}
              onChange={(e) => updateFloor(activeFloor, { name: e.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-danger"
            disabled={locked}
            onClick={() => {
              setFloors((current) => current.filter((_, i) => i !== activeFloor));
              setActiveFloor(0);
            }}
          >
            Quitar piso
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Zonas de {floor.name}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked || floor.zones.length >= 40}
          onClick={() =>
            updateFloor(activeFloor, {
              zones: [...floor.zones, { ...emptyZone }],
            })
          }
        >
          + Agregar zona
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {floor.zones.map((zone, index) => (
          <Card key={index}>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`zone-name-${index}`}>Nombre de la zona</Label>
                <Input
                  id={`zone-name-${index}`}
                  value={zone.name}
                  disabled={locked}
                  onChange={(e) => updateZone(index, { name: e.target.value })}
                  placeholder="VIP, General, Pista…"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`zone-type-${index}`}>Tipo</Label>
                <Select
                  id={`zone-type-${index}`}
                  value={zone.type}
                  disabled={locked}
                  onChange={(e) =>
                    updateZone(index, { type: e.target.value as ZoneTypeDraft })
                  }
                >
                  {Object.entries(ZONE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`zone-color-${index}`}>Color</Label>
                <Input
                  id={`zone-color-${index}`}
                  type="color"
                  value={zone.color}
                  disabled={locked}
                  onChange={(e) => updateZone(index, { color: e.target.value })}
                />
              </div>

              {zone.type === "GENERAL" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`zone-cap-${index}`}>Aforo</Label>
                  <Input
                    id={`zone-cap-${index}`}
                    type="number"
                    min="1"
                    value={zone.capacity}
                    disabled={locked}
                    onChange={(e) =>
                      updateZone(index, { capacity: e.target.value })
                    }
                    required
                  />
                </div>
              )}

              {zone.type === "TABLES" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`zone-tables-${index}`}>Mesas</Label>
                    <Input
                      id={`zone-tables-${index}`}
                      type="number"
                      min="1"
                      max="200"
                      value={zone.tableCount}
                      disabled={locked}
                      onChange={(e) =>
                        updateZone(index, { tableCount: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`zone-seats-${index}`}>Sillas por mesa</Label>
                    <Input
                      id={`zone-seats-${index}`}
                      type="number"
                      min="1"
                      max="50"
                      value={zone.seatsPerTable}
                      disabled={locked}
                      onChange={(e) =>
                        updateZone(index, { seatsPerTable: e.target.value })
                      }
                      required
                    />
                  </div>
                  <p className="self-end pb-2 text-sm text-muted-foreground sm:col-span-2">
                    = {zoneCapacity(zone)} personas · mesas M1…M
                    {zone.tableCount || 0}
                  </p>
                </>
              )}

              {zone.type === "SEATED" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`zone-rows-${index}`}>Filas (A-Z)</Label>
                    <Input
                      id={`zone-rows-${index}`}
                      type="number"
                      min="1"
                      max="26"
                      value={zone.rows}
                      disabled={locked}
                      onChange={(e) => updateZone(index, { rows: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`zone-spr-${index}`}>Asientos por fila</Label>
                    <Input
                      id={`zone-spr-${index}`}
                      type="number"
                      min="1"
                      max="60"
                      value={zone.seatsPerRow}
                      disabled={locked}
                      onChange={(e) =>
                        updateZone(index, { seatsPerRow: e.target.value })
                      }
                      required
                    />
                  </div>
                  <p className="self-end pb-2 text-sm text-muted-foreground sm:col-span-2">
                    = {zoneCapacity(zone)} asientos
                  </p>
                </>
              )}

              {floor.zones.length > 1 && (
                <div className="flex items-end sm:col-span-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    disabled={locked}
                    onClick={() =>
                      updateFloor(activeFloor, {
                        zones: floor.zones.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Quitar zona
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Los precios no se definen acá: se configuran por evento, en la pantalla
        de precios de cada evento.
      </p>

      <FieldError message={formError ?? undefined} />

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : initial ? "Guardar cambios" : "Crear venue"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/venues")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
