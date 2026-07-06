"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Input,
  Label,
  Select,
  FieldError,
} from "@/components/ui/Input";
import { venueSchema } from "@/lib/validations/venue";

interface ZoneDraft {
  name: string;
  priceMultiplier: string;
  numbered: boolean;
  capacity: string;
  rows: string;
  seatsPerRow: string;
}

export interface VenueFormInitial {
  id: string;
  name: string;
  address: string;
  city: string;
  zones: ZoneDraft[];
}

const emptyZone: ZoneDraft = {
  name: "",
  priceMultiplier: "1",
  numbered: false,
  capacity: "100",
  rows: "5",
  seatsPerRow: "10",
};

function zoneCapacity(zone: ZoneDraft): number {
  if (zone.numbered) {
    return (Number(zone.rows) || 0) * (Number(zone.seatsPerRow) || 0);
  }
  return Number(zone.capacity) || 0;
}

export function VenueForm({ initial }: { initial?: VenueFormInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [zones, setZones] = useState<ZoneDraft[]>(
    initial?.zones ?? [{ ...emptyZone, name: "General" }],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totalCapacity = zones.reduce((sum, zone) => sum + zoneCapacity(zone), 0);

  function updateZone(index: number, patch: Partial<ZoneDraft>) {
    setZones((current) =>
      current.map((zone, i) => (i === index ? { ...zone, ...patch } : zone)),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = {
      name,
      address,
      city,
      zones: zones.map((zone) => ({
        name: zone.name,
        priceMultiplier: zone.priceMultiplier,
        numbered: zone.numbered,
        capacity: zone.numbered ? undefined : zone.capacity,
        rows: zone.numbered ? zone.rows : undefined,
        seatsPerRow: zone.numbered ? zone.seatsPerRow : undefined,
      })),
    };

    const parsed = venueSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Revisá los datos del formulario");
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
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Zonas</h2>
          <p className="text-sm text-muted-foreground">
            Capacidad total: {totalCapacity} personas
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setZones((current) => [...current, { ...emptyZone }])}
          disabled={zones.length >= 20}
        >
          + Agregar zona
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {zones.map((zone, index) => (
          <Card key={index}>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`zone-name-${index}`}>Nombre de la zona</Label>
                <Input
                  id={`zone-name-${index}`}
                  value={zone.name}
                  onChange={(e) => updateZone(index, { name: e.target.value })}
                  placeholder="VIP, General, Platea..."
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`zone-mult-${index}`}>
                  Multiplicador de precio
                </Label>
                <Input
                  id={`zone-mult-${index}`}
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={zone.priceMultiplier}
                  onChange={(e) =>
                    updateZone(index, { priceMultiplier: e.target.value })
                  }
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`zone-type-${index}`}>Tipo</Label>
                <Select
                  id={`zone-type-${index}`}
                  value={zone.numbered ? "numbered" : "zone"}
                  onChange={(e) =>
                    updateZone(index, { numbered: e.target.value === "numbered" })
                  }
                >
                  <option value="zone">Capacidad libre</option>
                  <option value="numbered">Asientos numerados</option>
                </Select>
              </div>

              {zone.numbered ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`zone-rows-${index}`}>Filas (A-Z)</Label>
                    <Input
                      id={`zone-rows-${index}`}
                      type="number"
                      min="1"
                      max="26"
                      value={zone.rows}
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
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`zone-cap-${index}`}>Capacidad</Label>
                  <Input
                    id={`zone-cap-${index}`}
                    type="number"
                    min="1"
                    value={zone.capacity}
                    onChange={(e) =>
                      updateZone(index, { capacity: e.target.value })
                    }
                    required
                  />
                </div>
              )}

              {zones.length > 1 && (
                <div className="flex items-end sm:col-span-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() =>
                      setZones((current) => current.filter((_, i) => i !== index))
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

      <FieldError message={formError ?? undefined} />

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading
            ? "Guardando..."
            : initial
              ? "Guardar cambios"
              : "Crear venue"}
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
