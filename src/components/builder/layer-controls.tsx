"use client";
/**
 * Selected-layer controls (docs/04 §3 v4). Text layers get the text tool (text, font, ink
 * color, outline, alignment, letter spacing); every layer gets size in inches (with a
 * lock-ratio toggle), rotate, skew (±31°) and the Flip / Center / Fit / Reset-skew actions.
 */
import { useState } from "react";

import { TEXT_FONTS, type TextFontId } from "@/lib/text-fonts";
import { printedInches, type PrintArea } from "@/lib/garments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { BuilderImageLayer, BuilderTextLayer, BuilderTransform } from "./use-builder-state";

/** Degrees → Konva skew (tan), clamped to the schema's ±0.6. */
function degToSkew(deg: number): number {
  const skew = Math.tan((deg * Math.PI) / 180);
  return Math.max(-0.6, Math.min(0.6, skew));
}
/** Konva skew → degrees for display. */
function skewToDeg(skew: number): number {
  return Math.round((Math.atan(skew) * 180) / Math.PI);
}

const OUTLINE_WIDTHS = [
  { label: "None", width: 0 },
  { label: "Thin", width: 2 },
  { label: "Medium", width: 4 },
  { label: "Thick", width: 7 },
];

export interface LayerControlsProps {
  area: PrintArea;
  imageLayer?: BuilderImageLayer;
  textLayer?: BuilderTextLayer;
  /** The Transformer's lock-ratio toggle (shared with the canvas, owned by the builder). */
  lockRatio: boolean;
  onLockRatioChange: (lock: boolean) => void;
  onTransform: (transform: BuilderTransform) => void;
  onTextChange: (patch: {
    text?: string;
    font?: TextFontId;
    color?: string;
    align?: "left" | "center" | "right";
    letterSpacing?: number;
  }) => void;
  onOutlineChange: (outline: { color: string; width: number }) => void;
}

/** Sliders with aria-valuetext carrying their unit (WCAG 2.2). */
function SkewSlider({
  id,
  label,
  deg,
  onDeg,
}: {
  id: string;
  label: string;
  deg: number;
  onDeg: (deg: number) => void;
}) {
  return (
    <label className="flex min-h-9 flex-1 items-center gap-2 text-xs">
      <span className="text-text-2 shrink-0">{label}</span>
      <input
        id={id}
        type="range"
        min={-31}
        max={31}
        step={1}
        value={deg}
        aria-valuetext={`${deg} degrees`}
        onChange={(e) => onDeg(Number(e.target.value))}
        className="w-full accent-[var(--neon-cyan)]"
        data-testid={`skew-${id}`}
      />
      <span className="text-text-3 w-10 shrink-0 text-right font-mono">{deg}°</span>
    </label>
  );
}

export function LayerControls({
  area,
  imageLayer,
  textLayer,
  lockRatio,
  onLockRatioChange,
  onTransform,
  onTextChange,
  onOutlineChange,
}: LayerControlsProps) {
  const transform = (imageLayer ?? textLayer)!.transform;
  const layerId = (imageLayer ?? textLayer)!.id;
  const inches = printedInches(area, { w: transform.width, h: transform.height });
  const [skewXDeg, setSkewXDeg] = useState(skewToDeg(transform.skewX));
  const [skewYDeg, setSkewYDeg] = useState(skewToDeg(transform.skewY));
  const [textDraft, setTextDraft] = useState(textLayer?.text ?? "");

  // Follow the selection (the skew readout + text draft reset per layer):
  // the "adjust state during render" pattern from react.dev, no sync effect needed.
  const [syncedLayerId, setSyncedLayerId] = useState(layerId);
  if (syncedLayerId !== layerId) {
    setSyncedLayerId(layerId);
    setSkewXDeg(skewToDeg(transform.skewX));
    setSkewYDeg(skewToDeg(transform.skewY));
    setTextDraft(textLayer?.text ?? "");
  }

  const setSkew = (axis: "skewX" | "skewY", deg: number) => {
    onTransform({ ...transform, [axis]: degToSkew(deg) });
  };

  const setSizeInches = (axis: "w" | "h", inches: number) => {
    const clamped = Math.max(0.25, inches);
    const pxPerInchW = area.rect.w / area.maxInches.w;
    const pxPerInchH = area.rect.h / area.maxInches.h;
    // Lock on: keep the box's current aspect and scale the other axis. Lock off: only the
    // edited axis changes (free stretch, docs/04 §3 v4).
    let width = axis === "w" ? clamped * pxPerInchW : transform.width;
    let height = axis === "h" ? clamped * pxPerInchH : transform.height;
    if (lockRatio) {
      const ratio = transform.width / Math.max(1, transform.height);
      if (axis === "w") height = width / ratio;
      else width = height * ratio;
    }
    onTransform({
      ...transform,
      width: Math.min(5000, Math.max(1, width)),
      height: Math.min(5000, Math.max(1, height)),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {textLayer ? (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="text-layer-input" className="text-text-2 text-xs">
                Text
              </label>
              <span className="text-text-3 text-xs" aria-live="polite">
                {textLayer.text.length}/60
              </span>
            </div>
            <Input
              id="text-layer-input"
              type="text"
              value={textDraft}
              maxLength={60}
              data-testid="text-layer-input"
              onChange={(e) => {
                setTextDraft(e.target.value);
                onTextChange({ text: e.target.value });
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="text-layer-font" className="text-text-2 w-14 shrink-0 text-xs">
              Font
            </label>
            <Select value={textLayer.font} onValueChange={(font) => onTextChange({ font: font as TextFontId })}>
              <SelectTrigger id="text-layer-font" data-testid="text-layer-font" className="h-9 flex-1">
                <SelectValue placeholder="Font" />
              </SelectTrigger>
              <SelectContent>
                {TEXT_FONTS.map((font) => (
                  <SelectItem key={font.id} value={font.id} className={`font-[family-name:${font.family}]`}>
                    <span style={{ fontFamily: `"${font.family}"`, fontWeight: font.weight }}>{font.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="text-layer-color" className="text-text-2 w-14 shrink-0 text-xs">
              Ink
            </label>
            <input
              id="text-layer-color"
              type="color"
              value={textLayer.color}
              onChange={(e) => onTextChange({ color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-md border p-0.5"
              data-testid="text-layer-color"
            />
            <Input
              type="text"
              spellCheck={false}
              maxLength={7}
              value={textLayer.color}
              aria-label="Ink color hex"
              onChange={(e) => {
                const value = e.target.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(value)) onTextChange({ color: value });
              }}
              className="h-9 w-24 font-mono text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="text-layer-outline" className="text-text-2 w-14 shrink-0 text-xs">
              Outline
            </label>
            <Select
              value={String(textLayer.outline.width)}
              onValueChange={(width) => onOutlineChange({ color: textLayer.outline.color, width: Number(width) })}
            >
              <SelectTrigger id="text-layer-outline" data-testid="text-layer-outline" className="h-9 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTLINE_WIDTHS.map((o) => (
                  <SelectItem key={o.width} value={String(o.width)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="color"
              value={textLayer.outline.color}
              aria-label="Outline color"
              onChange={(e) => onOutlineChange({ color: e.target.value, width: Math.max(1, textLayer.outline.width) })}
              className="h-9 w-12 cursor-pointer rounded-md border p-0.5"
              data-testid="text-layer-outline-color"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-text-2 w-14 shrink-0 text-xs">Align</span>
            <div role="group" aria-label="Text alignment" className="flex gap-1">
              {(["left", "center", "right"] as const).map((align) => (
                <Button
                  key={align}
                  type="button"
                  variant={textLayer.align === align ? "primary" : "secondary"}
                  size="sm"
                  className="h-9"
                  aria-pressed={textLayer.align === align}
                  aria-label={`Align ${align}`}
                  onClick={() => onTextChange({ align })}
                >
                  {align === "left" ? "⯇" : align === "right" ? "⯈" : "≡"}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="text-layer-spacing" className="text-text-2 w-14 shrink-0 text-xs">
              Spacing
            </label>
            <input
              id="text-layer-spacing"
              type="range"
              min={-5}
              max={40}
              step={1}
              value={textLayer.letterSpacing}
              aria-valuetext={`${textLayer.letterSpacing} pixels`}
              onChange={(e) => onTextChange({ letterSpacing: Number(e.target.value) })}
              className="w-full accent-[var(--neon-cyan)]"
              data-testid="text-layer-spacing"
            />
          </div>
        </>
      ) : null}

      {imageLayer ? (
        <div className="border-border flex flex-col gap-1 border-t pt-3">
          <p className="text-text-2 text-sm" data-testid="printed-size">
            Printed size: about{" "}
            <span className="text-neon-yellow font-mono">
              {inches.w.toFixed(1)}″ × {inches.h.toFixed(1)}″
            </span>
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <label htmlFor="layer-lock" className="text-text-2 w-14 shrink-0 text-xs">
          Lock
        </label>
        <input
          id="layer-lock"
          type="checkbox"
          checked={lockRatio}
          onChange={(e) => onLockRatioChange(e.target.checked)}
          data-testid="layer-lock"
          className="h-4 w-4 accent-[var(--neon-pink)]"
        />
        <span className="text-text-3 text-xs">Keep the shape when resizing</span>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="layer-w" className="text-text-2 w-14 shrink-0 text-xs">
          Size
        </label>
        <Input
          id="layer-w"
          type="number"
          inputMode="decimal"
          min={0.25}
          step={0.25}
          value={inches.w.toFixed(2)}
          aria-label="Width in inches"
          onChange={(e) => setSizeInches("w", Number(e.target.value))}
          className="h-9 w-full text-sm"
          data-testid="layer-w"
        />
        <span aria-hidden="true" className="text-text-3 text-xs">
          ×
        </span>
        <Input
          id="layer-h"
          type="number"
          inputMode="decimal"
          min={0.25}
          step={0.25}
          value={inches.h.toFixed(2)}
          aria-label="Height in inches"
          onChange={(e) => setSizeInches("h", Number(e.target.value))}
          className="h-9 w-full text-sm"
          data-testid="layer-h"
        />
        <span aria-hidden="true" className="text-text-3 text-xs">
          ″
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="layer-rotate" className="text-text-2 w-14 shrink-0 text-xs">
          Rotate
        </label>
        <input
          id="layer-rotate"
          type="range"
          min={-180}
          max={180}
          step={1}
          value={Math.round(transform.rotation)}
          aria-valuetext={`${Math.round(transform.rotation)} degrees`}
          onChange={(e) => onTransform({ ...transform, rotation: Number(e.target.value) })}
          className="w-full accent-[var(--neon-cyan)]"
          data-testid="layer-rotate"
        />
        <Input
          type="number"
          min={-180}
          max={180}
          value={Math.round(transform.rotation)}
          aria-label="Rotation in degrees"
          onChange={(e) => onTransform({ ...transform, rotation: Number(e.target.value) })}
          className="h-9 w-16 text-sm"
        />
        <span aria-hidden="true" className="text-text-3 text-xs">
          °
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <SkewSlider
          id="horizontal"
          label="Skew ⇄"
          deg={skewXDeg}
          onDeg={(deg) => {
            setSkewXDeg(deg);
            setSkew("skewX", deg);
          }}
        />
        <SkewSlider
          id="vertical"
          label="Skew ⇅"
          deg={skewYDeg}
          onDeg={(deg) => {
            setSkewYDeg(deg);
            setSkew("skewY", deg);
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onTransform({ ...transform, flipX: !transform.flipX })}
        >
          Flip
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            onTransform({
              ...transform,
              x: area.rect.x + (area.rect.w - transform.width) / 2,
              y: area.rect.y + (area.rect.h - transform.height) / 2,
            })
          }
        >
          Center
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onTransform({ ...transform, skewX: 0, skewY: 0 })}
          data-testid="reset-skew"
        >
          Reset skew
        </Button>
      </div>
    </div>
  );
}
