import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  clampView,
  fitView,
  isTappable,
  panView,
  screenToCanvas,
  viewForBox,
  viewScale,
  zoomView,
} from "@/lib/map-view";

const canvas = { width: 1000, height: 700 };
const container = { width: 360, height: 400 };

describe("fitView / viewScale", () => {
  it("starts showing the whole plan", () => {
    expect(fitView(canvas)).toEqual({ x: 0, y: 0, w: 1000, h: 700 });
  });

  it("scales by whichever axis is tighter", () => {
    // 360/1000 = 0.36 across, 400/700 = 0.57 down — width wins
    expect(viewScale(fitView(canvas), container)).toBeCloseTo(0.36);
  });
});

describe("zoomView", () => {
  it("keeps the focus point under the finger", () => {
    const view = fitView(canvas);
    const focus = { x: 800, y: 200 };
    const zoomed = zoomView(view, 2, focus);
    expect(zoomed.w).toBe(500);
    expect(zoomed.h).toBe(350);
    // The focus sits at the same fraction of the view as before
    expect((focus.x - zoomed.x) / zoomed.w).toBeCloseTo(
      (focus.x - view.x) / view.w,
    );
    expect((focus.y - zoomed.y) / zoomed.h).toBeCloseTo(
      (focus.y - view.y) / view.h,
    );
  });

  it("zooming out is the same move backwards", () => {
    const view = { x: 100, y: 50, w: 400, h: 280 };
    const focus = { x: 250, y: 150 };
    const round = zoomView(zoomView(view, 2.5, focus), 1 / 2.5, focus);
    expect(round.x).toBeCloseTo(view.x);
    expect(round.y).toBeCloseTo(view.y);
    expect(round.w).toBeCloseTo(view.w);
  });
});

describe("clampView", () => {
  it("never zooms out past the whole plan", () => {
    const clamped = clampView({ x: 0, y: 0, w: 5000, h: 3500 }, canvas);
    expect(clamped.w).toBe(1000);
  });

  it("never zooms in past the limit", () => {
    const clamped = clampView({ x: 0, y: 0, w: 1, h: 0.7 }, canvas);
    expect(clamped.w).toBe(canvas.width / MAX_ZOOM);
  });

  it("keeps the aspect ratio while clamping the zoom", () => {
    const clamped = clampView({ x: 0, y: 0, w: 2000, h: 1400 }, canvas);
    expect(clamped.w / clamped.h).toBeCloseTo(2000 / 1400);
  });

  it("stops the plan from being dragged out of sight", () => {
    const dragged = clampView({ x: 9000, y: 9000, w: 200, h: 140 }, canvas);
    expect(dragged.x).toBeLessThanOrEqual(canvas.width);
    expect(dragged.y).toBeLessThanOrEqual(canvas.height);
    const back = clampView({ x: -9000, y: -9000, w: 200, h: 140 }, canvas);
    expect(back.x).toBeGreaterThanOrEqual(-200 * 0.25 - 0.001);
  });
});

describe("panView", () => {
  it("moves the plan with the finger, not against it", () => {
    const view = { x: 100, y: 100, w: 500, h: 350 };
    // Dragging right (positive dx) shows what is to the LEFT
    const panned = panView(view, { dx: 50, dy: 0 }, 0.5);
    expect(panned.x).toBe(0);
  });

  it("moves less when zoomed out", () => {
    const view = { x: 100, y: 100, w: 500, h: 350 };
    const far = panView(view, { dx: 50, dy: 0 }, 0.25);
    const near = panView(view, { dx: 50, dy: 0 }, 1);
    expect(view.x - far.x).toBeGreaterThan(view.x - near.x);
  });
});

describe("screenToCanvas", () => {
  const rect = { left: 0, top: 0, width: 360, height: 400 };

  it("maps the centre of the box to the centre of the view", () => {
    const view = fitView(canvas);
    const point = screenToCanvas({ x: 180, y: 200 }, view, rect);
    expect(point.x).toBeCloseTo(500);
    expect(point.y).toBeCloseTo(350);
  });

  it("accounts for the letterboxing", () => {
    const view = fitView(canvas);
    // At scale 0.36 the plan is 252 px tall inside a 400 px box: 74 px of
    // padding above it, so the top edge of the plan is at y = 74.
    const topEdge = screenToCanvas({ x: 0, y: 74 }, view, rect);
    expect(topEdge.y).toBeCloseTo(0, 1);
    expect(topEdge.x).toBeCloseTo(0);
  });

  it("survives a zoomed, panned view", () => {
    const view = { x: 400, y: 200, w: 250, h: 175 };
    const centre = screenToCanvas({ x: 180, y: 200 }, view, rect);
    expect(centre.x).toBeCloseTo(525);
    expect(centre.y).toBeCloseTo(287.5);
  });
});

describe("viewForBox", () => {
  it("frames a zone with a margin around it", () => {
    const view = viewForBox(
      { posX: 440, posY: 0, width: 260, height: 180 },
      canvas,
    );
    expect(view.x).toBeLessThan(440);
    expect(view.w).toBeGreaterThan(260);
    expect(view.x + view.w).toBeGreaterThan(700);
  });

  it("does not zoom past the limit for a tiny zone", () => {
    const view = viewForBox(
      { posX: 10, posY: 10, width: 20, height: 20 },
      canvas,
    );
    expect(view.w).toBeGreaterThanOrEqual(canvas.width / MAX_ZOOM);
  });
});

describe("isTappable", () => {
  it("refuses a target under 44 px", () => {
    // A 60-unit table on a phone showing the whole 1000-unit plan is ~22 px
    expect(isTappable(60, 0.36)).toBe(false);
    expect(isTappable(60, 0.8)).toBe(true);
  });
});
