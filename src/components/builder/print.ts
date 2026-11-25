/**
 * Print-resolution rule for the builder (docs/04 §3): warn when the effective DPI of
 * the uploaded image at its current printed width is under MIN_PRINT_DPI. SVGs are
 * vector and scale cleanly, so they never warn.
 */
import { effectiveDpi, MIN_PRINT_DPI } from "@/lib/mockup-schema";

import type { BuilderArtworkKind } from "./use-builder-state";

export function isLowResolution(kind: BuilderArtworkKind, naturalWidth: number, inchesWide: number): boolean {
  if (kind === "svg") return false;
  return effectiveDpi(naturalWidth, inchesWide) < MIN_PRINT_DPI;
}
