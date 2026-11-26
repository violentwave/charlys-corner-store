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

/** Artwork placement in template pixels (the view's width × height), Konva-style: x/y = top-left before rotation. */
export const artworkTransformSchema = z.object({
  x: finite.min(-5000).max(5000),
  y: finite.min(-5000).max(5000),
  width: finite.positive().max(5000),
  height: finite.positive().max(5000),
  rotation: finite.min(-360).max(360),
  flipX: z.boolean(),
});

export const mockupViewSchema = z.object({
  view: z.enum(VIEW_IDS),
  printArea: z.string().min(1).max(40),
  transform: artworkTransformSchema,
  /** Which uploaded file (artwork-<n>) is printed on this view. Defaults to the first. */
  artwork: z
    .number()
    .int()
    .min(0)
    .max(MOCKUP_MAX_ARTWORKS - 1)
    .default(0),
});

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
    const used = [...new Set(v.views.map((e) => e.artwork))].sort((a, b) => a - b);
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
/**
 * What the mockups.views column stores: the submitted view plus the rendered PNG's storage key.
 * `artwork` indexes mockups.artworks (rows from before 2026-11-25 have no index: treat as 0).
 */
export type MockupViewRecord = Omit<MockupView, "artwork"> & { artwork?: number; mockupKey: string };
/** One stored original file (mockups.artworks). */
export type MockupArtworkRecord = { key: string; name: string; contentType: string; size: number };

/** How many artwork files a payload references (artwork-0 … artwork-(n-1)). */
export function artworkCount(views: Pick<MockupView, "artwork">[]): number {
  return new Set(views.map((v) => v.artwork)).size;
}

/** Effective DPI of artwork `pixelWidth` px wide printed `inchesWide` inches wide. */
export function effectiveDpi(pixelWidth: number, inchesWide: number): number {
  return inchesWide > 0 ? pixelWidth / inchesWide : Infinity;
}
