/**
 * Shared schema for the mockup email gate (`POST /api/mockups`), used by the /design builder
 * and re-checked on the server. Client-safe: no server imports.
 *
 * Wire format (multipart/form-data):
 *   payload         JSON string, validated with `mockupPayloadSchema`
 *   artwork         the customer's original file (PNG/JPG/WEBP/SVG, ≤ 20 MB), stored untouched
 *   mockup-<view>   one rendered PNG per view listed in payload.views (≤ 8 MB each)
 *   turnstileToken  Cloudflare Turnstile token
 *   website         honeypot (must be empty)
 */
import { z } from "zod";

import { GARMENT_IDS, getGarment, isHexColor, type GarmentId } from "./garments";
import { emailField, nameField, phoneField, REFERRAL_SOURCES } from "./schemas";

/** Formats the builder can draw on a canvas (a subset of src/lib/artwork.ts kinds). */
export const MOCKUP_ARTWORK_KINDS = ["png", "jpeg", "webp", "svg"] as const;
export const MOCKUP_ARTWORK_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";
export const MOCKUP_ARTWORK_HELP = "PNG, JPG, WEBP, or SVG up to 20 MB. Transparent PNGs work best.";
export const MOCKUP_RENDER_MAX_BYTES = 8 * 1024 * 1024;
/** Effective print resolution below this shows the low-resolution warning (docs/04 §3). */
export const MIN_PRINT_DPI = 150;

const VIEW_IDS = ["front", "back"] as const;
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
});

export const mockupPayloadSchema = z
  .object({
    email: emailField,
    name: nameField.optional().or(z.literal("")),
    phone: phoneField,
    marketingOptIn: z.boolean().default(false),
    referralSource: z.enum(REFERRAL_SOURCES).optional(),
    referralOther: z.string().trim().max(200).optional(),
    garment: z.enum(GARMENT_IDS as [GarmentId, ...GarmentId[]]),
    colors: z.record(z.string().max(20), z.string()),
    views: z.array(mockupViewSchema).min(1, "Add your design to at least one side").max(2),
    sizes: z.record(z.string().max(8), z.number().int().min(0).max(10000)).default({}),
    notes: z.string().trim().max(2000).optional(),
    wantsQuote: z.boolean().default(false),
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
    for (const [zone, hex] of Object.entries(v.colors)) {
      if (!isHexColor(hex)) ctx.addIssue({ code: "custom", path: ["colors", zone], message: "Invalid color" });
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
    for (const size of Object.keys(v.sizes)) {
      if (!g.sizes.includes(size)) ctx.addIssue({ code: "custom", path: ["sizes", size], message: "Unknown size" });
    }
  });

export type MockupPayload = z.infer<typeof mockupPayloadSchema>;
export type MockupColors = Record<string, string>;
export type MockupSizes = Record<string, number>;
export type MockupView = z.infer<typeof mockupViewSchema>;
/** What the mockups.views column stores: the submitted view plus the rendered PNG's storage key. */
export type MockupViewRecord = MockupView & { mockupKey: string };

/** Effective DPI of artwork `pixelWidth` px wide printed `inchesWide` inches wide. */
export function effectiveDpi(pixelWidth: number, inchesWide: number): number {
  return inchesWide > 0 ? pixelWidth / inchesWide : Infinity;
}
