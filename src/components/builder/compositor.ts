/**
 * Garment compositor for the builder stage. Follows the layer contract documented at
 * the top of src/lib/garments.ts and docs/04 §2:
 *
 *   1. each zone mask filled with its color (`source-in`)
 *   2. shading.png `multiply` (folds, seams, texture)
 *   3. highlight.png `screen` at highlightOpacity(color) — stronger on dark fabric
 *   4. everything clipped to the shading alpha (the garment silhouette)
 *   5. the artwork, then shading `multiply` again over it (~0.6) so folds show through the print
 *
 * `garmentLayers` is pure so the order/ops/opacities are unit-testable; the compose*
 * helpers execute the layers on canvases (browser only — the stage is client-only).
 * Nothing here knows about the site theme: the canvas stays neutral on purpose.
 */
import { highlightOpacity, type GarmentView } from "@/lib/garments";
import type { MockupColors } from "@/lib/mockup-schema";

import type { BuilderTransform } from "./use-builder-state";

/** Multiply opacity of the second shading pass over the artwork (docs/04 §2: "about 0.6"). */
export const SHADING_OVER_ARTWORK_OPACITY = 0.6;

type CompositeOp = "source-in" | "source-over" | "multiply" | "screen" | "destination-in";

export type GarmentLayer =
  | { type: "mask"; zone: string; src: string; op: "source-in"; opacity: 1; color: string }
  | { type: "shading"; src: string; op: "multiply"; opacity: 1 }
  | { type: "highlight"; src: string; op: "screen"; opacity: number }
  | { type: "silhouette"; src: string; op: "destination-in"; opacity: 1 }
  | { type: "artwork"; op: "source-over"; opacity: 1 }
  | { type: "shading-over-artwork"; src: string; op: "multiply"; opacity: number };

/**
 * Color that drives the highlight sheen: the body zone's color, falling back to the
 * view's first zone (hat front, hoodie back, …) — per src/lib/garments.ts.
 */
export function activeZoneColor(view: GarmentView, colors: MockupColors): string {
  return colors.body ?? colors[view.zones[0]!] ?? "#f4f4f4";
}

/** Ordered layer list for a view, bottom to top. Pure. */
export function garmentLayers(view: GarmentView, colors: MockupColors): GarmentLayer[] {
  const layers: GarmentLayer[] = view.zones.map((zone) => ({
    type: "mask" as const,
    zone,
    src: view.layers.mask[zone]!,
    op: "source-in" as const,
    opacity: 1 as const,
    color: colors[zone] ?? "#f4f4f4",
  }));
  layers.push({ type: "shading", src: view.layers.shading, op: "multiply", opacity: 1 });
  layers.push({
    type: "highlight",
    src: view.layers.highlight,
    op: "screen",
    opacity: highlightOpacity(activeZoneColor(view, colors)),
  });
  layers.push({ type: "silhouette", src: view.layers.shading, op: "destination-in", opacity: 1 });
  layers.push({ type: "artwork", op: "source-over", opacity: 1 });
  layers.push({
    type: "shading-over-artwork",
    src: view.layers.shading,
    op: "multiply",
    opacity: SHADING_OVER_ARTWORK_OPACITY,
  });
  return layers;
}

/* ------------------------------------------------------------------ */
/* Canvas helpers (browser only — never run on the server)             */
/* ------------------------------------------------------------------ */

/** Recolored masks are cached per (src, hex): switching colors twice doesn't redo work. */
const maskCache = new Map<string, HTMLCanvasElement>();

export function maskCacheKey(src: string, hex: string): string {
  return `${src}|${hex}`;
}

/** Draws `img` into an offscreen canvas, then fills it with `hex` via source-in. */
export function recolorMask(src: string, img: HTMLImageElement, hex: string): HTMLCanvasElement {
  const key = maskCacheKey(src, hex);
  const cached = maskCache.get(key);
  if (cached) return cached;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
  maskCache.set(key, canvas);
  return canvas;
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  return { canvas, ctx };
}

export type TemplateImages = {
  masks: Record<string, HTMLImageElement>;
  shading: HTMLImageElement;
  highlight: HTMLImageElement;
};

/**
 * Composes the garment (mask fills + shading + highlight, clipped to the silhouette)
 * into one canvas the stage draws as a single image. Artwork layers are skipped —
 * the stage draws those on top, clipped to the print area.
 */
export function composeGarment(view: GarmentView, colors: MockupColors, images: TemplateImages): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(view.width, view.height);
  for (const layer of garmentLayers(view, colors)) {
    if (layer.type === "artwork" || layer.type === "shading-over-artwork") continue;
    const img =
      layer.type === "mask"
        ? images.masks[layer.zone]
        : layer.type === "silhouette"
          ? images.shading
          : images[layer.type];
    if (!img) continue;
    if (layer.type === "mask") {
      // The source-in fill happens inside recolorMask (mask alpha ← color); the filled
      // mask is then painted normally. Zones are disjoint, so source-over is correct —
      // painting with source-in here would erase everything already on the canvas.
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(recolorMask(layer.src, img, layer.color), 0, 0, view.width, view.height);
    } else {
      ctx.globalCompositeOperation = layer.op;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(img, 0, 0, view.width, view.height);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * The artwork plus the fold shading baked in, on a transparent canvas the garment
 * shows through. Shading is sampled at the artwork's current template position so
 * folds line up with the garment while it sits still (rotation is baked in local
 * space — the subtle drift while rotated is acceptable at 0.6 opacity).
 * The stage re-composes whenever the committed transform changes.
 */
export function composeArtworkLayer(
  artwork: HTMLImageElement,
  shading: HTMLImageElement,
  transform: BuilderTransform,
  view: Pick<GarmentView, "width" | "height">,
): HTMLCanvasElement {
  const w = Math.max(1, Math.round(transform.width));
  const h = Math.max(1, Math.round(transform.height));
  const { canvas, ctx } = makeCanvas(w, h);
  const drawArtwork = () => ctx.drawImage(artwork, 0, 0, w, h);
  drawArtwork();
  // Folds show through the print: shading multiply at ~0.6, sampled in template space.
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = SHADING_OVER_ARTWORK_OPACITY;
  ctx.drawImage(shading, -transform.x, -transform.y, view.width, view.height);
  // Clip back to the artwork's alpha so the shading never spills outside the print.
  ctx.globalCompositeOperation = "destination-in";
  ctx.globalAlpha = 1;
  drawArtwork();
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}
