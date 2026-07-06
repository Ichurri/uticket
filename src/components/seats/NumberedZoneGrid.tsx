"use client";

import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { useHydrated } from "@/lib/use-hydrated";
import type { SeatDto, ZoneDto } from "@/types/seat-map";

export function NumberedZoneGrid({
  eventId,
  eventTitle,
  zone,
}: {
  eventId: string;
  eventTitle: string;
  zone: ZoneDto;
}) {
  const hydrated = useHydrated();
  const toggleSeat = useCartStore((state) => state.toggleSeat);
  const selectedKeys = useCartStore((state) =>
    state.eventId === eventId
      ? state.items.filter((item) => item.seatId).map((item) => item.key)
      : [],
  );

  const rows = new Map<string, SeatDto[]>();
  for (const seat of zone.seats) {
    const rowSeats = rows.get(seat.row) ?? [];
    rowSeats.push(seat);
    rows.set(seat.row, rowSeats);
  }
  const sortedRows = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b));

  function seatClasses(seat: SeatDto, selected: boolean) {
    if (selected) {
      return "border-primary bg-primary text-primary-foreground";
    }
    switch (seat.status) {
      case "AVAILABLE":
        return "border-border bg-card text-card-foreground hover:border-primary hover:text-primary";
      case "RESERVED":
        return "cursor-not-allowed border-transparent bg-accent/30 text-muted-foreground";
      case "SOLD":
        return "cursor-not-allowed border-transparent bg-muted text-muted-foreground/50";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{zone.name}</h3>
        <p className="text-sm text-muted-foreground">
          {formatCurrency(zone.price)} por asiento · {zone.available} disponibles
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="mx-auto flex w-max flex-col gap-1.5">
          {sortedRows.map(([row, seats]) => (
            <div key={row} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">
                {row}
              </span>
              {seats
                .slice()
                .sort((a, b) => a.number - b.number)
                .map((seat) => {
                  const selected = hydrated && selectedKeys.includes(seat.id);
                  const disabled = seat.status !== "AVAILABLE";
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={disabled}
                      aria-label={`${zone.name} fila ${seat.row} asiento ${seat.number}`}
                      aria-pressed={selected}
                      title={`${zone.name} · ${seat.row}${seat.number}`}
                      className={cn(
                        "h-7 w-7 rounded border text-[10px] font-medium transition-colors sm:h-8 sm:w-8 sm:text-xs",
                        seatClasses(seat, selected),
                      )}
                      onClick={() =>
                        toggleSeat(
                          { eventId, eventTitle },
                          {
                            seatId: seat.id,
                            zoneId: zone.id,
                            label: `${zone.name} · Asiento ${seat.row}${seat.number}`,
                            unitPrice: zone.price,
                          },
                        )
                      }
                    >
                      {seat.number}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
