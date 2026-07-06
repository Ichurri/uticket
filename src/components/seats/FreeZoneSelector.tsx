"use client";

import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useCartStore, MAX_PER_ZONE } from "@/stores/cart-store";
import { useHydrated } from "@/lib/use-hydrated";
import type { ZoneDto } from "@/types/seat-map";

export function FreeZoneSelector({
  eventId,
  eventTitle,
  zone,
}: {
  eventId: string;
  eventTitle: string;
  zone: ZoneDto;
}) {
  const hydrated = useHydrated();
  const setZoneQuantity = useCartStore((state) => state.setZoneQuantity);
  const quantity = useCartStore((state) =>
    state.eventId === eventId
      ? (state.items.find((item) => item.key === zone.id)?.quantity ?? 0)
      : 0,
  );

  const shownQuantity = hydrated ? quantity : 0;
  const soldOut = zone.available <= 0;
  const maxQuantity = Math.min(zone.available, MAX_PER_ZONE);

  function update(delta: number) {
    setZoneQuantity(
      { eventId, eventTitle },
      { zoneId: zone.id, label: zone.name, unitPrice: zone.price },
      Math.min(shownQuantity + delta, maxQuantity),
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-semibold">{zone.name}</h3>
        <p className="text-sm text-muted-foreground">
          {formatCurrency(zone.price)} por boleto ·{" "}
          {soldOut ? "Agotado" : `${zone.available} cupos disponibles`}
        </p>
      </div>

      {!soldOut && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 text-base"
            aria-label={`Quitar boleto de ${zone.name}`}
            disabled={shownQuantity === 0}
            onClick={() => update(-1)}
          >
            −
          </Button>
          <span className="w-6 text-center font-semibold tabular-nums">
            {shownQuantity}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 text-base"
            aria-label={`Agregar boleto de ${zone.name}`}
            disabled={shownQuantity >= maxQuantity}
            onClick={() => update(1)}
          >
            +
          </Button>
        </div>
      )}
    </div>
  );
}
