/**
 * Viewport arithmetic for the buyer's floor map: what slice of the plan is on
 * screen, and how a pinch or a drag moves it.
 *
 * The map is an SVG whose `viewBox` IS this rectangle, drawn with
 * `preserveAspectRatio="xMidYMid meet"` — so the browser does the letterboxing
 * and the scale on screen is whichever axis is tighter.
 *
 * Pure on purpose: pinch gestures are impossible to verify in a headless
 * browser, so the arithmetic under them is tested instead.
 */

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Never zoom out past the whole plan, never past 10× into it. */
export const MAX_ZOOM = 10;
/** How far outside the plan a drag may drift, as a fraction of the view. */
const OVERSCROLL = 0.25;

export function fitView(canvas: Size): ViewBox {
  return { x: 0, y: 0, w: canvas.width, h: canvas.height };
}

/** Screen pixels per canvas unit. `meet` fits the tighter axis. */
export function viewScale(view: ViewBox, container: Size): number {
  if (view.w <= 0 || view.h <= 0) return 0;
  return Math.min(container.width / view.w, container.height / view.h);
}

/**
 * Zoom by `factor` around a fixed point given in canvas coordinates — the
 * pinch midpoint, or where the pointer is. That point stays under the finger.
 */
export function zoomView(
  view: ViewBox,
  factor: number,
  focus: { x: number; y: number },
): ViewBox {
  const w = view.w / factor;
  const h = view.h / factor;
  return {
    w,
    h,
    x: focus.x - (focus.x - view.x) * (w / view.w),
    y: focus.y - (focus.y - view.y) * (h / view.h),
  };
}

/** Keep the view inside the plan (with a little give) and within zoom limits. */
export function clampView(view: ViewBox, canvas: Size): ViewBox {
  const minW = canvas.width / MAX_ZOOM;
  const w = Math.min(Math.max(view.w, minW), canvas.width);
  // Keep the aspect the view started with, so clamping never squashes it
  const h = view.h * (w / view.w) || canvas.height;

  const slackX = w * OVERSCROLL;
  const slackY = h * OVERSCROLL;
  return {
    w,
    h,
    x: Math.min(Math.max(view.x, -slackX), Math.max(-slackX, canvas.width - w + slackX)),
    y: Math.min(Math.max(view.y, -slackY), Math.max(-slackY, canvas.height - h + slackY)),
  };
}

/** Move the view by a drag measured in SCREEN pixels. */
export function panView(
  view: ViewBox,
  delta: { dx: number; dy: number },
  scale: number,
): ViewBox {
  if (scale <= 0) return view;
  return { ...view, x: view.x - delta.dx / scale, y: view.y - delta.dy / scale };
}

/** A point on screen, in the canvas coordinates the shapes are drawn in. */
export function screenToCanvas(
  point: { x: number; y: number },
  view: ViewBox,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const scale = viewScale(view, rect);
  if (scale <= 0) return { x: view.x, y: view.y };
  // `meet` centres the letterboxed axis
  const drawnW = view.w * scale;
  const drawnH = view.h * scale;
  const padX = (rect.width - drawnW) / 2;
  const padY = (rect.height - drawnH) / 2;
  return {
    x: view.x + (point.x - rect.left - padX) / scale,
    y: view.y + (point.y - rect.top - padY) / scale,
  };
}

/** The view that frames one box, with room to breathe around it. */
export function viewForBox(
  box: { posX: number; posY: number; width: number; height: number },
  canvas: Size,
  padding = 0.12,
): ViewBox {
  const padX = box.width * padding;
  const padY = box.height * padding;
  return clampView(
    {
      x: box.posX - padX,
      y: box.posY - padY,
      w: box.width + padX * 2,
      h: box.height + padY * 2,
    },
    canvas,
  );
}

/**
 * Below this many screen pixels a target is too small to hit with a thumb, so
 * the map stops offering it and a tap zooms in instead. 44 px is the usual
 * floor for a touch target; a table is at least as wide as it is tall.
 */
export const MIN_TOUCH_PX = 44;

export function isTappable(sizeInCanvasUnits: number, scale: number) {
  return sizeInCanvasUnits * scale >= MIN_TOUCH_PX;
}
