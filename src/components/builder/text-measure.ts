"use client";
/**
 * Text layer sizing. A text layer is one line drawn at a base font size and scaled into its
 * transform box, so the box decides how the letters look. These helpers keep the box in step
 * with the words: new text starts at the font's natural shape, and editing the words, font
 * or spacing keeps the letters' current proportions instead of squashing them into the old
 * box (2026-11-25 fix).
 */
import Konva from "konva";

import { getTextFont, type TextFontId } from "@/lib/text-fonts";

import { centerInRect, layerBounds, resizeAroundCenter } from "./geometry";
import type { BuilderTextLayer, BuilderTransform } from "./use-builder-state";

/** Base font size (template px) text layers render at before being scaled into their box. */
export const TEXT_BASE_FONT_SIZE = 100;
export const TEXT_LINE_HEIGHT = 1;

/** Natural size of the line at the base font size (needs the font loaded for accuracy). */
export function measureText(text: string, font: TextFontId, letterSpacing: number): { width: number; height: number } {
  const f = getTextFont(font);
  const node = new Konva.Text({
    text,
    fontSize: TEXT_BASE_FONT_SIZE,
    fontFamily: f?.family ?? "sans-serif",
    fontStyle: f ? `${f.weight}` : "normal",
    letterSpacing,
  });
  const width = Math.max(node.width(), 1);
  node.destroy();
  return { width, height: TEXT_BASE_FONT_SIZE * TEXT_LINE_HEIGHT };
}

type Rect = { x: number; y: number; w: number; h: number };

/** A box for new text: natural shape, 80% of the print area's width (or its height), centered; down the length on sleeves. */
export function initialTextTransform(
  text: string,
  font: TextFontId,
  letterSpacing: number,
  rect: Rect,
): BuilderTransform {
  const natural = measureText(text, font, letterSpacing);
  // Tall, narrow areas (full sleeve): start the line running down the length, the usual
  // sleeve lettering, instead of a tiny line across it.
  const runsDown = rect.h >= rect.w * 2;
  const [along, across] = runsDown ? [rect.h, rect.w] : [rect.w, rect.h];
  const scale = Math.min((along * 0.8) / natural.width, (across * 0.8) / natural.height);
  const base: BuilderTransform = {
    x: 0,
    y: 0,
    width: natural.width * scale,
    height: natural.height * scale,
    rotation: runsDown ? 90 : 0,
    flipX: false,
    skewX: 0,
    skewY: 0,
  };
  return centerInRect(base, rect);
}

/**
 * The box after a change to the words, font or spacing: the current horizontal and vertical
 * scale stay, so stretched text stays stretched by the same amount and normal text stays
 * normal. If a longer line then runs past the print area, it shrinks evenly to fit.
 */
export function refitTextBox(
  layer: Pick<BuilderTextLayer, "text" | "font" | "letterSpacing" | "transform">,
  next: { text: string; font: TextFontId; letterSpacing: number },
  rect: Rect,
): BuilderTransform {
  const before = measureText(layer.text, layer.font, layer.letterSpacing);
  const after = measureText(next.text, next.font, next.letterSpacing);
  const sx = layer.transform.width / before.width;
  const sy = layer.transform.height / before.height;
  const resized = resizeAroundCenter(layer.transform, after.width * sx, after.height * sy);
  // Growing past the print area (rotation and skew included, e.g. down a sleeve): shrink evenly.
  const b = layerBounds(resized);
  const grew = after.width > before.width;
  const shrink = Math.min(1, rect.w / b.w, rect.h / b.h);
  return grew && shrink < 1 ? resizeAroundCenter(resized, resized.width * shrink, resized.height * shrink) : resized;
}
