"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { EVENT_CATEGORIES } from "@/lib/constants";

export interface EventFilterValues {
  q?: string;
  categoria?: string;
  ciudad?: string;
  fecha?: string;
  precio?: string;
}

export function EventFilters({
  cities,
  current,
}: {
  cities: string[];
  current: EventFilterValues;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(current.q ?? "");
  const [categoria, setCategoria] = useState(current.categoria ?? "");
  const [ciudad, setCiudad] = useState(current.ciudad ?? "");
  const [fecha, setFecha] = useState(current.fecha ?? "");
  const [precio, setPrecio] = useState(current.precio ?? "");

  const hasActiveFilters =
    current.q ||
    current.categoria ||
    current.ciudad ||
    current.fecha ||
    current.precio;

  function applyFilters() {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (categoria) params.set("categoria", categoria);
    if (ciudad) params.set("ciudad", ciudad);
    if (fecha) params.set("fecha", fecha);
    if (precio) params.set("precio", precio);
    const queryString = params.toString();
    router.push(queryString ? `/events?${queryString}` : "/events");
  }

  function clearFilters() {
    setQuery("");
    setCategoria("");
    setCiudad("");
    setFecha("");
    setPrecio("");
    router.push("/events");
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-query">Buscar</Label>
        <Input
          id="filter-query"
          type="search"
          placeholder="Nombre del evento"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters();
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-category">Categoría</Label>
        <Select
          id="filter-category"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="">Todas</option>
          {EVENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-city">Ciudad</Label>
        <Select
          id="filter-city"
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
        >
          <option value="">Todas</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-date">Desde la fecha</Label>
        <Input
          id="filter-date"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-price">Precio máx. (Bs)</Label>
        <Input
          id="filter-price"
          type="number"
          min="1"
          placeholder="Sin límite"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />
      </div>

      <div className="flex items-end gap-2">
        <Button type="button" size="sm" onClick={applyFilters} className="flex-1">
          Filtrar
        </Button>
        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
