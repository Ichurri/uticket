"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  clampView,
  panView,
  screenToCanvas,
  viewForBox,
  viewScale,
  zoomView,
  type ViewBox,
} from "@/lib/map-view";

const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 320;

type Gesture =
  | { mode: "none" }
  | { mode: "pan"; lastX: number; lastY: number }
  | {
      mode: "pinch";
      startDist: number;
      startView: ViewBox;
      focus: { x: number; y: number };
    };

export interface Box {
  posX: number;
  posY: number;
  width: number;
  height: number;
}

export interface ViewportContext {
  /** Screen pixels per canvas unit right now — what decides if a target is
   * big enough to be worth offering. */
  scale: number;
  /** Frame one box, e.g. the zone somebody just tapped. */
  focusBox: (box: Box) => void;
}

/**
 * The pan/pinch/zoom shell every floor plan is drawn inside — the buyer's map
 * and the organizer's live map both mount it and only differ in what they
 * paint. The arithmetic lives in `src/lib/map-view.ts` and is unit-tested;
 * this component is the pointer plumbing on top of it.
 */
export function PlanViewport({
  canvas,
  bounds,
  ariaLabel,
  className,
  children,
}: {
  canvas: { width: number; height: number };
  /** What to frame on open — usually the box holding every zone */
  bounds: Box;
  ariaLabel: string;
  className?: string;
  children: (context: ViewportContext) => React.ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ mode: "none" });
  const travelled = useRef(0);
  const lastTap = useRef(0);

  const home = viewForBox(bounds, canvas, 0.06);
  const [view, setView] = useState<ViewBox>(home);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => {
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const scale = box.width > 0 ? viewScale(view, box) : 0;

  function rect() {
    const node = svgRef.current;
    return node
      ? node.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0 };
  }

  function zoomAround(factor: number, client: { x: number; y: number }) {
    const area = rect();
    const limits = { width: canvas.width, height: canvas.height };
    setView((current) =>
      clampView(
        zoomView(current, factor, screenToCanvas(client, current, area)),
        limits,
      ),
    );
  }

  // Wheel has to be a native listener: React's is passive, and a passive
  // handler cannot stop the page from scrolling under the map.
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const limits = { width: canvas.width, height: canvas.height };
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      const area = node!.getBoundingClientRect();
      setView((current) =>
        clampView(
          zoomView(
            current,
            event.deltaY < 0 ? 1.18 : 1 / 1.18,
            screenToCanvas(point, current, area),
          ),
          limits,
        ),
      );
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [canvas.width, canvas.height]);

  function distance(points: { x: number; y: number }[]) {
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function midpoint(points: { x: number; y: number }[]) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  function handlePointerDown(event: React.PointerEvent) {
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    travelled.current = 0;

    const points = [...pointers.current.values()];
    if (points.length === 2) {
      gesture.current = {
        mode: "pinch",
        startDist: distance(points) || 1,
        startView: view,
        focus: screenToCanvas(midpoint(points), view, rect()),
      };
    } else {
      gesture.current = {
        mode: "pan",
        lastX: event.clientX,
        lastY: event.clientY,
      };
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const active = gesture.current;
    const points = [...pointers.current.values()];
    const limits = { width: canvas.width, height: canvas.height };

    if (active.mode === "pinch" && points.length >= 2) {
      const factor = distance(points) / active.startDist;
      travelled.current += Math.abs(1 - factor) * 100;
      setView(
        clampView(zoomView(active.startView, factor, active.focus), limits),
      );
      return;
    }

    if (active.mode !== "pan") return;
    const dx = event.clientX - active.lastX;
    const dy = event.clientY - active.lastY;
    travelled.current += Math.hypot(dx, dy);
    gesture.current = { mode: "pan", lastX: event.clientX, lastY: event.clientY };
    setView((current) => clampView(panView(current, { dx, dy }, scale), limits));
  }

  function handlePointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      // A quick tap that went nowhere is a double tap candidate. The event's
      // own timestamp is used rather than a clock read, which would be an
      // impure call in a component body.
      if (travelled.current <= TAP_SLOP) {
        const now = event.timeStamp;
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          zoomAround(2, { x: event.clientX, y: event.clientY });
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      }
      gesture.current = { mode: "none" };
    } else if (pointers.current.size === 1) {
      const [remaining] = [...pointers.current.values()];
      gesture.current = { mode: "pan", lastX: remaining.x, lastY: remaining.y };
    }
  }

  /**
   * A drag that ends on a shape still fires a click on it. Swallowing that
   * click here, in the capture phase, means nothing painted inside has to
   * know the difference between a tap and the end of a pan.
   */
  function swallowDragClicks(event: React.MouseEvent) {
    if (travelled.current > TAP_SLOP) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  const context: ViewportContext = {
    scale,
    focusBox: (target) => setView(viewForBox(target, canvas)),
  };

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative h-[300px] overflow-hidden rounded-2xl border border-border bg-muted/30 sm:h-[420px]",
        className,
      )}
    >
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full touch-none select-none"
        role="img"
        aria-label={ariaLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g onClickCapture={swallowDragClicks}>{children(context)}</g>
      </svg>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <ViewportButton
          label="Acercar"
          onClick={() => {
            const area = rect();
            zoomAround(1.6, {
              x: area.left + area.width / 2,
              y: area.top + area.height / 2,
            });
          }}
        >
          +
        </ViewportButton>
        <ViewportButton
          label="Alejar"
          onClick={() => {
            const area = rect();
            zoomAround(1 / 1.6, {
              x: area.left + area.width / 2,
              y: area.top + area.height / 2,
            });
          }}
        >
          −
        </ViewportButton>
        <ViewportButton label="Ver todo el plano" onClick={() => setView(home)}>
          <span className="text-[11px] font-semibold">Todo</span>
        </ViewportButton>
      </div>
    </div>
  );
}

function ViewportButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl",
        "border border-border bg-card/95 text-lg font-semibold shadow-sm backdrop-blur",
        "transition-colors hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
