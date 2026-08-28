"use client";

import { useEffect, useRef, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { useHydrated } from "@/lib/use-hydrated";
import { seatCartLabel, seatIsTaken } from "@/lib/seat-map-view";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const toggleSeat = useCartStore((state) => state.toggleSeat);
  // Select stable references and derive outside: selectors must not build
  // fresh arrays or useSyncExternalStore loops ("getSnapshot should be cached")
  const cartEventId = useCartStore((state) => state.eventId);
  const cartItems = useCartStore((state) => state.items);
  const selectedKeys =
    cartEventId === eventId
      ? new Set(
          cartItems.filter((item) => item.seatId).map((item) => item.key),
        )
      : new Set<string>();

  const rows = new Map<string, SeatDto[]>();
  for (const seat of zone.seats) {
    const rowSeats = rows.get(seat.row) ?? [];
    rowSeats.push(seat);
    rows.set(seat.row, rowSeats);
  }
  const sortedRows = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b));

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function updateFades() {
      setShowLeftFade(el!.scrollLeft > 4);
      setShowRightFade(el!.scrollLeft + el!.clientWidth < el!.scrollWidth - 4);
    }
    updateFades();
    el.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades);
    return () => {
      el.removeEventListener("scroll", updateFades);
      window.removeEventListener("resize", updateFades);
    };
  }, [zone.id]);

  function seatClasses(seat: SeatDto, selected: boolean) {
    if (selected) {
      return "border-primary bg-primary text-primary-foreground shadow-glow-ring";
    }
    switch (seat.status) {
      case "AVAILABLE":
        return "border-border bg-card text-card-foreground hover:border-primary hover:text-primary";
      case "HELD":
        return "cursor-not-allowed border-transparent bg-accent/30 text-muted-foreground";
      case "SOLD":
      case "BLOCKED":
        return "cursor-not-allowed border-transparent bg-muted text-muted-foreground/45";
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

      <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto pb-2">
          <div className="mx-auto flex w-max flex-col gap-1.5">
            {sortedRows.map(([row, seats]) => (
              <div key={row} className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-center font-mono text-xs font-semibold tracking-[0.05em] text-gold dark:text-gold-bright">
                  {row}
                </span>
                {seats
                  .slice()
                  .sort((a, b) => a.number - b.number)
                  .map((seat) => {
                    const selected = hydrated && selectedKeys.has(seat.id);
                    const disabled = seatIsTaken(seat);
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        disabled={disabled}
                        aria-label={`${zone.name} fila ${seat.row} asiento ${seat.number}`}
                        aria-pressed={selected}
                        title={`${zone.name} · ${seat.row}${seat.number}`}
                        className={cn(
                          "h-9 w-9 touch-manipulation rounded-lg border font-mono text-[10px] font-semibold transition-[transform,colors] duration-150 active:scale-90 motion-reduce:active:scale-100 sm:h-8 sm:w-8 sm:text-xs",
                          seatClasses(seat, selected),
                        )}
                        onClick={() =>
                          toggleSeat(
                            { eventId, eventTitle },
                            {
                              seatId: seat.id,
                              eventZoneId: zone.id,
                              label: seatCartLabel(zone, seat),
                              unitPrice: seat.price,
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
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent transition-opacity duration-200",
            showLeftFade ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent transition-opacity duration-200",
            showRightFade ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
