/**
 * Transform math for the builder stage. The persisted transform (artworkTransformSchema)
 * stores x/y as the top-left of the untransformed box, rotation applied around the box
 * center. Konva nodes use a centered offset, so the stage converts between the two.
 */
import type { BuilderTransform } from "./use-builder-state";

/** Schema bounds from artworkTransformSchema (src/lib/mockup-schema.ts). */
const POSITION_LIMIT = 5000;
const SIZE_MIN = 1;
const SIZE_MAX = 5000;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Box top-left (before rotation) for a node positioned at its rotated center. */
export function centerToTopLeft(cx: number, cy: number, width: number, height: number, rotationDeg: number) {
  const r = rad(rotationDeg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = width / 2;
  const dy = height / 2;
  return { x: cx - (dx * cos - dy * sin), y: cy - (dx * sin + dy * cos) };
}

export function topLeftToCenter(t: Pick<BuilderTransform, "x" | "y" | "width" | "height" | "rotation">) {
  const r = rad(t.rotation);
  const dx = t.width / 2;
  const dy = t.height / 2;
  return { cx: t.x + (dx * Math.cos(r) - dy * Math.sin(r)), cy: t.y + (dx * Math.sin(r) + dy * Math.cos(r)) };
}

/** artworkTransformSchema skew bound (≈ ±31°). */
export const SKEW_LIMIT = 0.6;

/** Clamps a transform into the payload schema's bounds. */
export function clampTransform(t: BuilderTransform): BuilderTransform {
  const width = Math.min(SIZE_MAX, Math.max(SIZE_MIN, t.width));
  const height = Math.min(SIZE_MAX, Math.max(SIZE_MIN, t.height));
  return {
    x: Math.min(POSITION_LIMIT, Math.max(-POSITION_LIMIT, t.x)),
    y: Math.min(POSITION_LIMIT, Math.max(-POSITION_LIMIT, t.y)),
    width,
    height,
    rotation: Math.min(360, Math.max(-360, t.rotation)),
    flipX: t.flipX,
    skewX: Math.min(SKEW_LIMIT, Math.max(-SKEW_LIMIT, t.skewX ?? 0)),
    skewY: Math.min(SKEW_LIMIT, Math.max(-SKEW_LIMIT, t.skewY ?? 0)),
  };
}

/** Scales the box by `factor` around its (rotated) center. */
export function scaleAroundCenter(t: BuilderTransform, factor: number): BuilderTransform {
  const { cx, cy } = topLeftToCenter(t);
  const width = Math.min(SIZE_MAX, Math.max(SIZE_MIN, t.width * factor));
  const height = Math.min(SIZE_MAX, Math.max(SIZE_MIN, t.height * factor));
  const { x, y } = centerToTopLeft(cx, cy, width, height, t.rotation);
  return { ...t, x, y, width, height };
}

/** Moves the box by dx/dy template px (screen-space nudge in the view's axes). */
export function nudgeTransform(t: BuilderTransform, dx: number, dy: number): BuilderTransform {
  return clampTransform({ ...t, x: t.x + dx, y: t.y + dy });
}

/** Rotates the box by `deltaDeg` around its center. */
export function rotateAroundCenter(t: BuilderTransform, deltaDeg: number): BuilderTransform {
  const { cx, cy } = topLeftToCenter(t);
  const rotation = t.rotation + deltaDeg;
  const { x, y } = centerToTopLeft(cx, cy, t.width, t.height, rotation);
  return { ...t, x, y, rotation };
}

/** Recenters the box on the print-area rect (size/rotation kept). */
export function centerInRect(
  t: BuilderTransform,
  rect: { x: number; y: number; w: number; h: number },
): BuilderTransform {
  const { x, y } = centerToTopLeft(rect.x + rect.w / 2, rect.y + rect.h / 2, t.width, t.height, t.rotation);
  return { ...t, x, y };
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The four corners of a layer as drawn: center from the transform, then skew (Konva order:
 * x' = x + skewX·y, y' = skewY·x + y), then rotation, around the box center.
 */
export function layerCorners(t: BuilderTransform): { x: number; y: number }[] {
  const { cx, cy } = topLeftToCenter(t);
  const r = rad(t.rotation);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const hw = t.width / 2;
  const hh = t.height / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([px, py]) => {
    const kx = px! + (t.skewX ?? 0) * py!;
    const ky = (t.skewY ?? 0) * px! + py!;
    return { x: cx + kx * cos - ky * sin, y: cy + kx * sin + ky * cos };
  });
}

/** Axis-aligned bounds of the layer as drawn (rotation + skew included). */
export function layerBounds(t: BuilderTransform): Rect {
  const pts = layerCorners(t);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** True when part of the layer sits outside the print area (that part won't print). */
export function isOutsideArea(t: BuilderTransform, rect: Rect, tolerance = 1): boolean {
  const b = layerBounds(t);
  return (
    b.x < rect.x - tolerance ||
    b.y < rect.y - tolerance ||
    b.x + b.w > rect.x + rect.w + tolerance ||
    b.y + b.h > rect.y + rect.h + tolerance
  );
}

/**
 * Scales the layer (keeping its shape, rotation and skew) so everything it draws fits the
 * print area, and centers it there.
 */
export function fitIntoRect(t: BuilderTransform, rect: Rect): BuilderTransform {
  const b = layerBounds(t);
  const factor = Math.min(rect.w / Math.max(b.w, 1e-6), rect.h / Math.max(b.h, 1e-6));
  const width = Math.min(SIZE_MAX, Math.max(SIZE_MIN, t.width * factor));
  const height = Math.min(SIZE_MAX, Math.max(SIZE_MIN, t.height * factor));
  return centerInRect({ ...t, width, height }, rect);
}

/** Sets an absolute rotation, turning around the box center. */
export function setRotationAroundCenter(t: BuilderTransform, rotation: number): BuilderTransform {
  return rotateAroundCenter(t, rotation - t.rotation);
}

/** Resizes the box to width × height around its (rotated) center. */
export function resizeAroundCenter(t: BuilderTransform, width: number, height: number): BuilderTransform {
  const { cx, cy } = topLeftToCenter(t);
  const w = Math.min(SIZE_MAX, Math.max(SIZE_MIN, width));
  const h = Math.min(SIZE_MAX, Math.max(SIZE_MIN, height));
  const { x, y } = centerToTopLeft(cx, cy, w, h, t.rotation);
  return { ...t, x, y, width: w, height: h };
}
