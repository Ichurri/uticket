"use client";

import { NumberedZoneGrid } from "@/components/seats/NumberedZoneGrid";
import { FreeZoneSelector } from "@/components/seats/FreeZoneSelector";
import type { EventSeatMapDto } from "@/types/seat-map";

const legend = [
  { label: "Disponible", className: "border border-border bg-card" },
  { label: "Seleccionado", className: "bg-primary" },
  { label: "Reservado", className: "bg-accent/30" },
  { label: "Vendido", className: "bg-muted" },
];

export function SeatMap({ seatMap }: { seatMap: EventSeatMapDto }) {
  const numberedZones = seatMap.zones.filter((zone) => zone.numbered);
  const freeZones = seatMap.zones.filter((zone) => !zone.numbered);

  return (
    <div className="flex flex-col gap-6">
      {numberedZones.length > 0 && (
        <>
          <div className="rounded bg-foreground py-1.5 text-center text-xs font-semibold uppercase tracking-[0.3em] text-background">
            Escenario
          </div>

          {numberedZones.map((zone) => (
            <NumberedZoneGrid
              key={zone.id}
              eventId={seatMap.eventId}
              eventTitle={seatMap.eventTitle}
              zone={zone}
            />
          ))}

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {legend.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className={`h-3.5 w-3.5 rounded ${item.className}`} />
                {item.label}
              </span>
            ))}
          </div>
        </>
      )}

      {freeZones.length > 0 && (
        <div className="flex flex-col gap-3">
          {numberedZones.length > 0 && (
            <h3 className="text-sm font-medium text-muted-foreground">
              Zonas de capacidad libre
            </h3>
          )}
          {freeZones.map((zone) => (
            <FreeZoneSelector
              key={zone.id}
              eventId={seatMap.eventId}
              eventTitle={seatMap.eventTitle}
              zone={zone}
            />
          ))}
        </div>
      )}
    </div>
  );
}
