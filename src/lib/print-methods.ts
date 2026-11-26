/**
 * Print / decoration methods and which garments, colors and print areas each one fits
 * (decided 2026-11-26: every method the shop runs is listed; the builder disables the ones
 * that don't fit and says why). The server re-checks with the same rules (mockup-schema.ts).
 *
 * Rules, from fabric facts (docs/05 research digest):
 * - Screen printing, DTF and heat-transfer vinyl work on every blank we carry.
 * - DTG needs cotton or a cotton blend (not 100% polyester, not hats).
 * - Embroidery: not on thin 100% polyester performance tees (puckers); not on print areas
 *   bigger than 12" on a side (full-size front/back, full-length sleeve).
 * - Sublimation needs ≥ 65% polyester AND a light garment color (the dye can't cover dark fabric).
 */
import { luma, type GarmentConfig, type PrintArea } from "./garments";

export const PRINT_METHOD_IDS = ["screen", "dtf", "dtg", "embroidery", "sublimation", "vinyl"] as const;
export type PrintMethodId = (typeof PRINT_METHOD_IDS)[number];

/** What the customer picked for one side: a method, or "let the shop recommend one". */
export const PRINT_METHOD_CHOICES = ["recommend", ...PRINT_METHOD_IDS] as const;
export type PrintMethodChoice = (typeof PRINT_METHOD_CHOICES)[number];

export type PrintMethod = { id: PrintMethodId; name: string; blurb: string };

export const PRINT_METHODS: readonly PrintMethod[] = [
  { id: "screen", name: "Screen printing", blurb: "Bold, durable ink. Best value on bigger runs." },
  { id: "dtf", name: "DTF (direct-to-film)", blurb: "Full color and fine detail on almost any fabric." },
  { id: "dtg", name: "DTG (direct-to-garment)", blurb: "Soft full-color print, straight onto cotton." },
  { id: "embroidery", name: "Embroidery", blurb: "Stitched thread. Classic on hats, polos and hoodies." },
  { id: "sublimation", name: "Sublimation", blurb: "Dyed into light polyester, so you can't feel it." },
  { id: "vinyl", name: "Heat-transfer vinyl", blurb: "Crisp solid colors. Great for names and numbers." },
];

export const RECOMMEND_LABEL = "Recommend one for me";

/** Largest print side (inches) we embroider. */
export const EMBROIDERY_MAX_INCHES = 12;
/** Lightest-color threshold for sublimation (luma 0–1). */
export const SUBLIMATION_MIN_LUMA = 0.55;

export function printMethodName(choice: PrintMethodChoice): string {
  if (choice === "recommend") return "Shop's recommendation";
  return PRINT_METHODS.find((m) => m.id === choice)!.name;
}

/** The garment's main color: the body zone, else the first zone. */
function mainColor(garment: GarmentConfig, colors: Record<string, string>): string | undefined {
  return colors.body ?? colors[garment.colorZones[0]?.id ?? ""];
}

/**
 * Why `method` can't be used here, or null when it fits. Reasons are short, customer-facing
 * sentences shown next to the disabled option.
 */
export function methodBlocker(
  method: PrintMethodId,
  garment: GarmentConfig,
  colors: Record<string, string>,
  area: PrintArea,
): string | null {
  switch (method) {
    case "screen":
    case "dtf":
    case "vinyl":
      return null;
    case "dtg":
      if (garment.fabric === "polyester") return "DTG needs cotton. Try DTF or sublimation on polyester.";
      if (garment.fabric === "hat") return "DTG doesn't work on hats.";
      return null;
    case "embroidery":
      if (garment.fabric === "polyester") return "Too thin to embroider. Try DTF or sublimation.";
      if (Math.max(area.maxInches.w, area.maxInches.h) > EMBROIDERY_MAX_INCHES) {
        return "This print area is too big to embroider. Pick a smaller one.";
      }
      return null;
    case "sublimation": {
      if (garment.fabric !== "polyester") return "Sublimation only works on polyester (Performance) shirts.";
      const hex = mainColor(garment, colors);
      if (!hex || luma(hex) < SUBLIMATION_MIN_LUMA) return "Sublimation needs a light shirt color.";
      return null;
    }
  }
}

export function isMethodAllowed(
  choice: PrintMethodChoice,
  garment: GarmentConfig,
  colors: Record<string, string>,
  area: PrintArea,
): boolean {
  return choice === "recommend" || methodBlocker(choice, garment, colors, area) === null;
}

/** The choice to use: the picked one when it still fits (colors/area may have changed), else "recommend". */
export function effectiveMethod(
  choice: PrintMethodChoice | undefined,
  garment: GarmentConfig,
  colors: Record<string, string>,
  area: PrintArea,
): PrintMethodChoice {
  return choice && isMethodAllowed(choice, garment, colors, area) ? choice : "recommend";
}
