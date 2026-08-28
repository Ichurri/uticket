"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NumberedZoneGrid } from "@/components/seats/NumberedZoneGrid";
import { FreeZoneSelector } from "@/components/seats/FreeZoneSelector";
import { TableZoneGrid } from "@/components/seats/TableZoneGrid";
import { VenueMap } from "@/components/seats/VenueMap";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { useHydrated } from "@/lib/use-hydrated";
import {
  floorHasLayout,
  seatCartLabel,
  tableCartLabel,
  tableFreeSpots,
  zoneSectionId,
} from "@/lib/seat-map-view";
import type {
  EventSeatMapDto,
  FloorDto,
  SeatDto,
  TableDto,
  ZoneDto,
} from "@/types/seat-map";

const legend = [
  { label: "Disponible", className: "border border-border bg-card" },
  { label: "Seleccionado", className: "bg-primary shadow-glow-ring" },
  { label: "Reservado", className: "bg-accent/30" },
  { label: "Vendido", className: "bg-muted" },
];

/* Alternating gold/cream marquee bulbs framing the stage label — always
   on the night-constant stage surface, so fixed hex is intentional here
   (same reasoning as the ticket's forced-dark surface). */
const MARQUEE_LIGHTS = 11;

function Stage() {
  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden rounded-b-[150px] px-6 pb-4 pt-3 text-center shadow-[0_14px_36px_-8px_rgb(109_43_255/0.5)]"
      style={{ backgroundImage: "linear-gradient(180deg, #2a1852, #171128)" }}
    >
      <div
        className="animate-stage-spotlight pointer-events-none absolute inset-x-0 -top-10 mx-auto h-32 w-56 opacity-85"
        style={{ backgroundImage: "var(--spotlight)" }}
      />
      <div className="relative">
        <div className="mb-2 flex items-center justify-center gap-2">
          {Array.from({ length: MARQUEE_LIGHTS }).map((_, i) => (
            <span
              key={i}
              className="h-1 w-1 rounded-full"
              style={{ backgroundColor: i % 2 === 0 ? "#e9ce8b" : "#f5ece0" }}
            />
          ))}
        </div>
        <span className="font-mono text-xs font-bold uppercase tracking-[0.34em] text-[#cda349]">
          Escenario
        </span>
      </div>
      <div className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-[rgb(205_163_73/0.55)]" />
    </div>
  );
}

/** Anchor for the map to scroll to, with a brief ring when it lands. */
function ZoneSection({
  zone,
  highlighted,
  children,
}: {
  zone: ZoneDto;
  highlighted: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={zoneSectionId(zone)}
      className={cn(
        "scroll-mt-20 rounded-2xl transition-shadow duration-500",
        highlighted && "ring-2 ring-primary ring-offset-4 ring-offset-background",
      )}
    >
      {children}
    </div>
  );
}

function FloorZones({
  eventId,
  eventTitle,
  floor,
  highlightedZoneId,
}: {
  eventId: string;
  eventTitle: string;
  floor: FloorDto;
  highlightedZoneId: string | null;
}) {
  const seatedZones = floor.zones.filter((zone) => zone.type === "SEATED");
  const tableZones = floor.zones.filter((zone) => zone.type === "TABLES");
  const generalZones = floor.zones.filter((zone) => zone.type === "GENERAL");

  return (
    <div className="flex flex-col gap-6">
      {seatedZones.length > 0 && (
        <>
          <Stage />
          {seatedZones.map((zone) => (
            <ZoneSection
              key={zone.id}
              zone={zone}
              highlighted={highlightedZoneId === zone.id}
            >
              <NumberedZoneGrid
                eventId={eventId}
                eventTitle={eventTitle}
                zone={zone}
              />
            </ZoneSection>
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

      {tableZones.length > 0 && (
        <div className="flex flex-col gap-4">
          {tableZones.map((zone) => (
            <ZoneSection
              key={zone.id}
              zone={zone}
              highlighted={highlightedZoneId === zone.id}
            >
              <TableZoneGrid
                eventId={eventId}
                eventTitle={eventTitle}
                zone={zone}
              />
            </ZoneSection>
          ))}
        </div>
      )}

      {generalZones.length > 0 && (
        <div className="flex flex-col gap-3">
          {(seatedZones.length > 0 || tableZones.length > 0) && (
            <h3 className="text-sm font-medium text-muted-foreground">
              Zonas de capacidad libre
            </h3>
          )}
          {generalZones.map((zone) => (
            <ZoneSection
              key={zone.id}
              zone={zone}
              highlighted={highlightedZoneId === zone.id}
            >
              <FreeZoneSelector
                eventId={eventId}
                eventTitle={eventTitle}
                zone={zone}
              />
            </ZoneSection>
          ))}
        </div>
      )}
    </div>
  );
}

export function SeatMap({ seatMap }: { seatMap: EventSeatMapDto }) {
  const [activeFloorId, setActiveFloorId] = useState(
    seatMap.floors[0]?.id ?? null,
  );
  const [highlightedZoneId, setHighlightedZoneId] = useState<string | null>(null);
  const hydrated = useHydrated();

  const toggleSeat = useCartStore((state) => state.toggleSeat);
  const toggleTable = useCartStore((state) => state.toggleTable);
  const setTableSeats = useCartStore((state) => state.setTableSeats);
  // Stable references only; the Set is derived outside (see CLAUDE.md)
  const cartEventId = useCartStore((state) => state.eventId);
  const cartItems = useCartStore((state) => state.items);

  const selectedKeys = useMemo(() => {
    if (!hydrated || cartEventId !== seatMap.eventId) return new Set<string>();
    return new Set(cartItems.map((item) => item.key));
  }, [hydrated, cartEventId, cartItems, seatMap.eventId]);

  const highlightTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  /** Tapped a zone on the map: take them to the controls that sell it. */
  const focusZone = useCallback((zone: ZoneDto) => {
    setHighlightedZoneId(zone.id);
    document.getElementById(zoneSectionId(zone))?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(
      () => setHighlightedZoneId(null),
      2400,
    );
  }, []);

  const event = { eventId: seatMap.eventId, eventTitle: seatMap.eventTitle };

  const selectTable = useCallback(
    (zone: ZoneDto, table: TableDto) => {
      if (zone.tableSaleMode === "PER_SEAT") {
        const chosen =
          cartItems.find((item) => item.key === table.id)?.seats ?? 0;
        const free = tableFreeSpots(table);
        setTableSeats(
          event,
          {
            eventTableId: table.id,
            eventZoneId: zone.id,
            label: tableCartLabel(zone, table),
            unitPrice: table.seatPrice,
          },
          chosen >= free ? 0 : chosen + 1,
        );
        return;
      }
      toggleTable(event, {
        eventTableId: table.id,
        eventZoneId: zone.id,
        label: tableCartLabel(zone, table),
        unitPrice: table.price,
        admits: table.seats,
      });
    },
    // `event` is rebuilt each render but only carries two stable strings
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartItems, setTableSeats, toggleTable, seatMap.eventId, seatMap.eventTitle],
  );

  const selectSeat = useCallback(
    (zone: ZoneDto, seat: SeatDto) => {
      toggleSeat(event, {
        seatId: seat.id,
        eventZoneId: zone.id,
        label: seatCartLabel(zone, seat),
        unitPrice: seat.price,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleSeat, seatMap.eventId, seatMap.eventTitle],
  );

  if (seatMap.floors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay zonas a la venta para este evento.
      </p>
    );
  }

  const activeFloor =
    seatMap.floors.find((floor) => floor.id === activeFloorId) ??
    seatMap.floors[0];

  return (
    <div className="flex flex-col gap-5">
      {/* Most venues are one flat room. A single tab reading "Planta baja"
          would just be a concept the organizer never asked for. */}
      {seatMap.floors.length > 1 && (
        <div
          role="tablist"
          aria-label="Pisos del lugar"
          className="flex flex-wrap gap-2 border-b border-border pb-2"
        >
          {seatMap.floors.map((floor) => {
            const active = floor.id === activeFloor.id;
            return (
              <button
                key={floor.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setActiveFloorId(floor.id)}
                className={cn(
                  "min-h-11 touch-manipulation rounded-lg px-3.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {floor.name}
              </button>
            );
          })}
        </div>
      )}

      {/* A plan nobody drew has every zone stacked at the origin: drawing
          that would be a lie, so those venues get the lists only. */}
      {floorHasLayout(activeFloor) && (
        <VenueMap
          key={activeFloor.id}
          floor={activeFloor}
          selectedKeys={selectedKeys}
          onSelectTable={selectTable}
          onSelectSeat={selectSeat}
          onFocusZone={focusZone}
        />
      )}

      <FloorZones
        eventId={seatMap.eventId}
        eventTitle={seatMap.eventTitle}
        floor={activeFloor}
        highlightedZoneId={highlightedZoneId}
      />
    </div>
  );
}
