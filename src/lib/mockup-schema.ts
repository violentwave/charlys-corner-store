/**
 * Shared schema for the builder's send step (`POST /api/mockups`), used by the /design builder
 * and re-checked on the server. Client-safe: no server imports.
 *
 * Wire format (multipart/form-data):
 *   payload         JSON string, validated with `mockupPayloadSchema`
 *   artwork-<n>     the customer's original files (PNG/JPG/WEBP/SVG, ≤ 20 MB each, ≤ 30 MB total),
 *                   n = 0..3; each view's `artwork` index says which file is printed there, so the
 *                   back can carry the same file as the front or a different one. Stored untouched.
 *                   (A single legacy `artwork` field is read as artwork-0.)
 *   mockup-<view>   one rendered PNG per view listed in payload.views (≤ 4 MB each)
 *   website         honeypot (must be empty)
 *
 * Who is sending comes from the verified account (v2): the session's email/name/lead are
 * used and no contact fields travel from the client.
 */
import { z } from "zod";

import { findCombo, GARMENT_IDS, getGarment, isHexColor, isPaletteColor, VIEW_IDS, type GarmentId } from "./garments";
import { REFERRAL_SOURCES } from "./schemas";
import { TEXT_FONT_IDS } from "./text-fonts";

/** Formats the builder can draw on a canvas (a subset of src/lib/artwork.ts kinds). */
export const MOCKUP_ARTWORK_KINDS = ["png", "jpeg", "webp", "svg"] as const;
export const MOCKUP_ARTWORK_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";
export const MOCKUP_ARTWORK_HELP = "PNG, JPG, WEBP, or SVG up to 20 MB. Transparent PNGs work best.";
export const MOCKUP_RENDER_MAX_BYTES = 4 * 1024 * 1024;
/** Distinct artwork files per mockup (one per view at most) and their combined size cap. */
export const MOCKUP_MAX_ARTWORKS = 4;
export const MOCKUP_ARTWORK_TOTAL_BYTES = 30 * 1024 * 1024;
/** Effective print resolution below this shows the low-resolution warning (docs/04 §3). */
export const MIN_PRINT_DPI = 150;

export const MOCKUP_INTENTS = ["email", "order"] as const;
export type MockupIntent = (typeof MOCKUP_INTENTS)[number];
const finite = z.number().finite();

/**
 * Placement in template pixels (the view's width × height), Konva-style: x/y = top-left before
 * rotation. width and height are independent, so a layer can be stretched (2026-11-25: e.g.
 * lettering running down a sleeve); skewX/skewY slant it (Konva skew, -0.6…0.6 ≈ ±31°).
 */
export const artworkTransformSchema = z.object({
  x: finite.min(-5000).max(5000),
  y: finite.min(-5000).max(5000),
  width: finite.positive().max(5000),
  height: finite.positive().max(5000),
  rotation: finite.min(-360).max(360),
  flipX: z.boolean(),
  skewX: finite.min(-0.6).max(0.6).default(0),
  skewY: finite.min(-0.6).max(0.6).default(0),
});

/** Max items (images + text) on one side. */
export const MAX_LAYERS_PER_VIEW = 8;
export const MAX_TEXT_LENGTH = 60;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color");

export const imageLayerSchema = z.object({
  type: z.literal("image"),
  /** Which uploaded file (artwork-<n>) this layer shows. */
  artwork: z
    .number()
    .int()
    .min(0)
    .max(MOCKUP_MAX_ARTWORKS - 1),
  transform: artworkTransformSchema,
});

/**
 * Lettering. Ink colors can be any color (screen-print ink is mixed/Pantone-matched); the
 * owner confirms the match. The text is visitor-typed free text: it goes to the owner, never
 * into customer emails.
 */
export const textLayerSchema = z.object({
  type: z.literal("text"),
  text: z.string().trim().min(1, "Type some text").max(MAX_TEXT_LENGTH),
  font: z.enum(TEXT_FONT_IDS),
  color: hexColor,
  /** Outline (stroke) around the letters; width 0 = none. Template px. */
  outline: z.object({ color: hexColor, width: finite.min(0).max(12) }).default({ color: "#000000", width: 0 }),
  align: z.enum(["left", "center", "right"]).default("center"),
  /** Extra space between letters, template px. */
  letterSpacing: finite.min(-5).max(40).default(0),
  /**
   * Arch (2026-11-26): 0 = straight; 1 = arched up into a half circle (rainbow); -1 = arched down
   * (smile). The line keeps its length along the curve.
   */
  curve: finite.min(-1).max(1).default(0),
  transform: artworkTransformSchema,
});

export const layerSchema = z.discriminatedUnion("type", [imageLayerSchema, textLayerSchema]);

/**
 * One side. Canonical form: `layers` (bottom → top). The single-artwork form used before
 * 2026-11-25 ({ transform, artwork }) is still accepted and normalized to one image layer.
 */
export const mockupViewSchema = z.preprocess(
  (value) => {
    if (value && typeof value === "object" && !("layers" in value) && "transform" in value) {
      const { transform, artwork, ...rest } = value as Record<string, unknown>;
      return { ...rest, layers: [{ type: "image", artwork: artwork ?? 0, transform }] };
    }
    return value;
  },
  z.object({
    view: z.enum(VIEW_IDS),
    printArea: z.string().min(1).max(40),
    layers: z.array(layerSchema).min(1, "Add something to this side").max(MAX_LAYERS_PER_VIEW),
  }),
);

export const mockupPayloadSchema = z
  .object({
    marketingOptIn: z.boolean().default(false),
    referralSource: z.enum(REFERRAL_SOURCES).optional(),
    referralOther: z.string().trim().max(200).optional(),
    garment: z.enum(GARMENT_IDS as [GarmentId, ...GarmentId[]]),
    colors: z.record(z.string().max(20), z.string()),
    views: z.array(mockupViewSchema).min(1, "Add your design to at least one side").max(VIEW_IDS.length),
    sizes: z.record(z.string().max(8), z.number().int().min(0).max(10000)).default({}),
    notes: z.string().trim().max(2000).optional(),
    /**
     * "email" = send me this mockup; "order" = order request (needs at least one size/qty;
     * the owner confirms the price and invoices). Decided 2026-11-25.
     */
    intent: z.enum(MOCKUP_INTENTS).default("email"),
  })
  .superRefine((v, ctx) => {
    if (v.referralSource === "other" && !v.referralOther) {
      ctx.addIssue({ code: "custom", path: ["referralOther"], message: "Please tell us how you heard about us" });
    }
    const g = getGarment(v.garment);
    const zones = g.colorZones.map((z) => z.id);
    const keys = Object.keys(v.colors);
    if (keys.length !== zones.length || !zones.every((z) => keys.includes(z))) {
      ctx.addIssue({ code: "custom", path: ["colors"], message: "Pick a color for every part of the garment" });
    }
    let hexOk = true;
    for (const [zone, hex] of Object.entries(v.colors)) {
      if (!isHexColor(hex)) {
        hexOk = false;
        ctx.addIssue({ code: "custom", path: ["colors", zone], message: "Invalid color" });
      } else if (!g.allowCustomHex && g.combos.length === 0 && !isPaletteColor(g, hex)) {
        ctx.addIssue({ code: "custom", path: ["colors", zone], message: "Pick one of the available colors" });
      }
    }
    // Combo blanks (raglan, trucker hat): the zones must match one real combo exactly.
    if (hexOk && g.combos.length > 0 && !g.allowCustomHex && !findCombo(g, v.colors)) {
      ctx.addIssue({ code: "custom", path: ["colors"], message: "Pick one of the available color combos" });
    }
    const seen = new Set<string>();
    v.views.forEach((entry, i) => {
      const view = g.views.find((gv) => gv.id === entry.view);
      if (!view) {
        ctx.addIssue({ code: "custom", path: ["views", i, "view"], message: `${g.name} has no ${entry.view} view` });
        return;
      }
      if (seen.has(entry.view)) ctx.addIssue({ code: "custom", path: ["views", i, "view"], message: "Duplicate view" });
      seen.add(entry.view);
      if (!view.printAreas.some((a) => a.id === entry.printArea)) {
        ctx.addIssue({ code: "custom", path: ["views", i, "printArea"], message: "Unknown print location" });
      }
    });
    // Artwork indexes must be dense (0..n-1) so every uploaded file is used.
    const used = [...artworkIndexes(v.views)].sort((a, b) => a - b);
    if (used.some((n, i) => n !== i)) {
      ctx.addIssue({ code: "custom", path: ["views"], message: "Artwork files must be numbered from 0" });
    }
    for (const size of Object.keys(v.sizes)) {
      if (!g.sizes.includes(size)) ctx.addIssue({ code: "custom", path: ["sizes", size], message: "Unknown size" });
    }
    if (v.intent === "order" && Object.values(v.sizes).reduce((sum, qty) => sum + qty, 0) < 1) {
      ctx.addIssue({ code: "custom", path: ["sizes"], message: "Add at least one size and quantity to order" });
    }
  });

export type MockupPayload = z.infer<typeof mockupPayloadSchema>;
export type MockupColors = Record<string, string>;
export type MockupSizes = Record<string, number>;
export type MockupView = z.infer<typeof mockupViewSchema>;
export type MockupLayer = z.infer<typeof layerSchema>;
export type MockupImageLayer = z.infer<typeof imageLayerSchema>;
export type MockupTextLayer = z.infer<typeof textLayerSchema>;
/**
 * What the mockups.views column stores: the normalized view (layers) plus the rendered PNG's
 * storage key. Older rows hold { transform, artwork? } instead of layers; read them through
 * mockupViewSchema, which normalizes both.
 */
export type MockupViewRecord = MockupView & { mockupKey: string };
/** One stored original file (mockups.artworks). */
export type MockupArtworkRecord = { key: string; name: string; contentType: string; size: number };

/** Every artwork index used by image layers across the views. */
export function artworkIndexes(views: Pick<MockupView, "layers">[]): Set<number> {
  return new Set(views.flatMap((v) => v.layers.flatMap((l) => (l.type === "image" ? [l.artwork] : []))));
}

/** How many artwork files a payload references (artwork-0 … artwork-(n-1)). May be 0 (text only). */
export function artworkCount(views: Pick<MockupView, "layers">[]): number {
  return artworkIndexes(views).size;
}

/** Effective DPI of artwork `pixelWidth` px wide printed `inchesWide` inches wide. */
export function effectiveDpi(pixelWidth: number, inchesWide: number): number {
  return inchesWide > 0 ? pixelWidth / inchesWide : Infinity;
}
