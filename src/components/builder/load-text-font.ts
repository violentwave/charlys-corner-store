"use client";
import { getTextFont } from "@/lib/text-fonts";

/**
 * Resolves once a text-tool font is ready to draw. Konva paints to a canvas, which doesn't
 * re-render when a webfont arrives, so call this before drawing (or re-drawing) a text layer.
 * Never rejects: falls back to whatever the browser has after a failed load.
 */
export async function loadTextFont(id: string): Promise<void> {
  const font = getTextFont(id);
  if (!font || typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.load(`${font.weight} 48px "${font.family}"`);
  } catch {
    // Fall back silently; the layer still renders in a system font.
  }
}
