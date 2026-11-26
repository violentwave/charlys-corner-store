"use client";
/**
 * Text layer sizing. A text layer is one line drawn at a base font size and scaled into its
 * transform box, so the box decides how the letters look. These helpers keep the box in step
 * with the words: new text starts at the font's natural shape, and editing the words, font
 * or spacing keeps the letters' current proportions instead of squashing them into the old
 * box (2026-11-25 fix). Curved text (2026-11-26) is drawn along an arc; its box is the
 * bounds of the arched line, so arching keeps the letter size and the box follows the arc.
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

/** Below this |curve| a text layer is drawn straight. */
export const CURVE_EPSILON = 0.01;

/**
 * How a text layer is drawn before it's scaled into its transform box, at the base font size.
 * Straight: a Konva.Text of `width` × `height`. Curved: a Konva.TextPath along `path` (an SVG
 * arc through the origin, the arc's apex), glyphs centered on it; `width`/`height` are the
 * drawn band's bounds and `offsetX`/`offsetY` its center in path coordinates.
 */
export type TextGeometry = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  /** SVG path data for a curved line; null when straight. */
  path: string | null;
};

export function textGeometry(text: string, font: TextFontId, letterSpacing: number, curve: number): TextGeometry {
  const natural = measureText(text, font, letterSpacing);
  return curvedGeometry(natural.width, natural.height, curve);
}

/**
 * Pure arc math (unit-tested): the line keeps its length `lineWidth` along an arc that spans
 * |curve| × 180°. A very short line would need a radius smaller than the letters, so the
 * radius never goes below the letter height (it then spans less of the arc).
 */
export function curvedGeometry(lineWidth: number, letterHeight: number, curve: number): TextGeometry {
  if (Math.abs(curve) < CURVE_EPSILON) {
    return { width: lineWidth, height: letterHeight, offsetX: lineWidth / 2, offsetY: letterHeight / 2, path: null };
  }
  const half = letterHeight / 2;
  const radius = Math.max(lineWidth / (Math.abs(curve) * Math.PI), letterHeight);
  const span = Math.min(lineWidth / radius, Math.PI); // radians the line covers
  // A little extra arc on both ends, so letters at the ends aren't cut off by the path's end.
  const pathSpan = Math.min(span + (2 * letterHeight) / radius, 2 * Math.PI - 0.01);
  const up = curve > 0;
  // Apex at (0,0); the circle's center is below (arched up) or above (arched down).
  const cy = up ? radius : -radius;
  const point = (angle: number) => ({ x: radius * Math.sin(angle), y: cy - (up ? 1 : -1) * radius * Math.cos(angle) });
  const start = point(-pathSpan / 2);
  const end = point(pathSpan / 2);
  const large = pathSpan > Math.PI ? 1 : 0;
  const sweep = up ? 1 : 0;
  const path = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} ${sweep} ${end.x} ${end.y}`;
  // Bounds of the band the letters fill (centerline ± half the letter height).
  const halfWidth = (radius + half) * Math.sin(Math.min(span / 2, Math.PI / 2));
  const depth = radius - (radius - half) * Math.cos(span / 2); // apex → lowest inner corner
  const top = up ? -half : -depth;
  const bottom = up ? depth : half;
  return { width: 2 * halfWidth, height: bottom - top, offsetX: 0, offsetY: (top + bottom) / 2, path };
}

type Rect = { x: number; y: number; w: number; h: number };

/** A box for new text: natural shape, 80% of the print area's width (or its height), centered; down the length on sleeves. */
export function initialTextTransform(
  text: string,
  font: TextFontId,
  letterSpacing: number,
  rect: Rect,
): BuilderTransform {
  const natural = textGeometry(text, font, letterSpacing, 0);
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
  layer: Pick<BuilderTextLayer, "text" | "font" | "letterSpacing" | "curve" | "transform">,
  next: { text: string; font: TextFontId; letterSpacing: number; curve: number },
  rect: Rect,
): BuilderTransform {
  const before = textGeometry(layer.text, layer.font, layer.letterSpacing, layer.curve);
  const after = textGeometry(next.text, next.font, next.letterSpacing, next.curve);
  const sx = layer.transform.width / before.width;
  const sy = layer.transform.height / before.height;
  const resized = resizeAroundCenter(layer.transform, after.width * sx, after.height * sy);
  // Growing past the print area (rotation and skew included, e.g. down a sleeve): shrink evenly.
  const b = layerBounds(resized);
  const grew = after.width > before.width || after.height > before.height;
  const shrink = Math.min(1, rect.w / b.w, rect.h / b.h);
  return grew && shrink < 1 ? resizeAroundCenter(resized, resized.width * shrink, resized.height * shrink) : resized;
}
