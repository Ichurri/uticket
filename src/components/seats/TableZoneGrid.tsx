"use client";

import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { useHydrated } from "@/lib/use-hydrated";
import { CheckIcon, UsersIcon } from "@/components/ui/icons";
import {
  tableCartLabel,
  tableFreeSpots,
  tableIsTaken,
} from "@/lib/seat-map-view";
import type { TableDto, ZoneDto } from "@/types/seat-map";

/** Tables in a WHOLE_TABLE zone are taken or left, like a numbered seat but
 * priced as one unit. PER_SEAT zones get a spot stepper instead. */
export function TableZoneGrid({
  eventId,
  eventTitle,
  zone,
}: {
  eventId: string;
  eventTitle: string;
  zone: ZoneDto;
}) {
  const hydrated = useHydrated();
  const toggleTable = useCartStore((state) => state.toggleTable);
  const setTableSeats = useCartStore((state) => state.setTableSeats);
  // Selectors must return stable references; derive outside (see CLAUDE.md)
  const cartEventId = useCartStore((state) => state.eventId);
  const cartItems = useCartStore((state) => state.items);
  const selectedKeys =
    cartEventId === eventId
      ? new Set(
          cartItems.filter((item) => item.eventTableId).map((item) => item.key),
        )
      : new Set<string>();
  const seatsInCart = new Map(
    cartEventId === eventId
      ? cartItems
          .filter((item) => item.eventTableId)
          .map((item) => [item.key, item.seats ?? 0] as const)
      : [],
  );
  const perSeat = zone.tableSaleMode === "PER_SEAT";

  // Count what can still be bought, not what is untouched: in PER_SEAT mode a
  // table someone is holding two spots of is still on the market.
  const availableCount = zone.tables.filter(
    (table) => !tableIsTaken(table, zone.tableSaleMode),
  ).length;

  function statusNote(table: TableDto) {
    // "Reservada" would contradict the stepper underneath it: when spots are
    // sold one by one, a hold on some of them leaves the rest for sale.
    if (perSeat && !tableIsTaken(table, zone.tableSaleMode)) return null;
    switch (table.status) {
      case "AVAILABLE":
        return null;
      case "HELD":
        return perSeat ? "Sin lugares" : "Reservada";
      case "SOLD":
        return perSeat ? "Sin lugares" : "Vendida";
      case "BLOCKED":
        return "No disponible";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{zone.name}</h3>
        <p className="text-sm text-muted-foreground">
          {availableCount === 0
            ? "Sin mesas disponibles"
            : `${availableCount} de ${zone.tables.length} disponibles`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {zone.tables.map((table) => {
          const selected = hydrated && selectedKeys.has(table.id);
          const freeSpots = tableFreeSpots(table);
          const taken = tableIsTaken(table, zone.tableSaleMode);
          const note = statusNote(table);
          const chosenSeats = seatsInCart.get(table.id) ?? 0;
          const unitPrice = perSeat ? table.seatPrice : table.price;

          return (
            <button
              key={table.id}
              type="button"
              disabled={taken}
              aria-pressed={selected}
              aria-label={`${zone.name} ${table.label}, ${perSeat ? `${freeSpots} lugares libres` : `hasta ${table.seats} personas`}, ${formatCurrency(unitPrice)}`}
              onClick={() =>
                perSeat
                  ? setTableSeats(
                      { eventId, eventTitle },
                      {
                        eventTableId: table.id,
                        eventZoneId: zone.id,
                        label: tableCartLabel(zone, table),
                        unitPrice: table.seatPrice,
                      },
                      chosenSeats >= freeSpots ? 0 : chosenSeats + 1,
                    )
                  : toggleTable(
                      { eventId, eventTitle },
                      {
                        eventTableId: table.id,
                        eventZoneId: zone.id,
                        label: tableCartLabel(zone, table),
                        unitPrice: table.price,
                        admits: table.seats,
                      },
                    )
              }
              className={cn(
                "flex touch-manipulation flex-col gap-2 rounded-xl border p-4 text-left transition-[transform,colors] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
                taken
                  ? "cursor-not-allowed border-transparent bg-muted text-muted-foreground/60"
                  : selected
                    ? "border-primary bg-primary-soft shadow-glow-ring"
                    : "border-border bg-card hover:border-primary",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{table.label}</span>
                {(selected || chosenSeats > 0) && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                )}
                {note && (
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wide">
                    {note}
                  </span>
                )}
              </div>

              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <UsersIcon className="h-4 w-4 shrink-0" />
                {perSeat
                  ? `${freeSpots} de ${table.seats} lugares libres`
                  : `Hasta ${table.seats} persona${table.seats === 1 ? "" : "s"}`}
              </span>

              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  taken ? "" : "text-primary",
                )}
              >
                {formatCurrency(unitPrice)}
              </span>
              {!taken && (
                <span className="text-xs text-muted-foreground">
                  {perSeat
                    ? chosenSeats > 0
                      ? `${chosenSeats} lugar${chosenSeats === 1 ? "" : "es"} elegido${chosenSeats === 1 ? "" : "s"} · tocá para sumar`
                      : "Precio por lugar · tocá para sumar"
                    : `Mesa completa · incluye ${table.seats} entrada${table.seats === 1 ? "" : "s"}`}
                </span>
              )}
              {table.inclusion && (
                <span className="text-xs font-medium text-primary">
                  {table.inclusion}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
