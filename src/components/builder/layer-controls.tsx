"use client";
/**
 * Selected-layer controls (docs/04 §3 v4). Text layers get the text tool (text, font, ink
 * color, outline, letter spacing); every layer gets size in inches (with a lock-ratio
 * toggle), rotate, skew (±31°) and the Flip / Center / Fit / Reset-skew actions.
 *
 * Text is one line scaled to fill its box, so alignment would do nothing: the schema keeps
 * `align` (default center) but there is no control for it.
 *
 * Every change passes a `mergeKey` (layer + control) so one slider drag or one burst of
 * typing is one undo step. Free-typed fields (text, hex, numbers) keep a local draft and
 * only commit valid values, so the design never holds an empty text or a NaN.
 */
import { useState } from "react";

import { TEXT_FONTS, type TextFontId } from "@/lib/text-fonts";
import { printedInches, type PrintArea } from "@/lib/garments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  fitTransform,
  type BuilderImageLayer,
  type BuilderTextLayer,
  type BuilderTransform,
} from "./use-builder-state";

/**
 * A number field with a local draft: typing "1." or clearing the box doesn't snap the value;
 * Enter or blur commits a finite number (else reverts). Follows the external value when idle.
 */
function DraftNumberInput({
  value,
  onCommit,
  format,
  ...rest
}: {
  value: number;
  onCommit: (value: number) => void;
  format: (value: number) => string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "onKeyDown">) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) onCommit(n);
    setDraft(null);
  };
  return (
    <Input
      {...rest}
      type="number"
      value={draft ?? format(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

/** A #rrggbb text field with a local draft (partial input is allowed while typing). */
function HexInput({ value, onCommit, label }: { value: string; onCommit: (hex: string) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      type="text"
      spellCheck={false}
      maxLength={7}
      value={draft ?? value}
      aria-label={label}
      onChange={(e) => {
        const next = e.target.value.trim();
        setDraft(next);
        if (/^#[0-9a-fA-F]{6}$/.test(next)) onCommit(next.toLowerCase());
      }}
      onBlur={() => setDraft(null)}
      className="h-9 w-24 font-mono text-xs"
    />
  );
}

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
  /** `mergeKey` groups a run of changes from one control into one undo step. */
  onTransform: (transform: BuilderTransform, mergeKey?: string) => void;
  onTextChange: (
    patch: {
      text?: string;
      font?: TextFontId;
      color?: string;
      align?: "left" | "center" | "right";
      letterSpacing?: number;
    },
    mergeKey?: string,
  ) => void;
  onOutlineChange: (outline: { color: string; width: number }, mergeKey?: string) => void;
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
  // Skew readouts derive from the transform, so Undo / Reset skew / the canvas keep them in sync.
  const skewXDeg = skewToDeg(transform.skewX);
  const skewYDeg = skewToDeg(transform.skewY);
  /** The text box's draft: may be empty while typing; only non-blank text is committed. */
  const [textDraft, setTextDraft] = useState<{ layerId: string; text: string } | null>(null);
  const textValue = textDraft?.layerId === layerId ? textDraft.text : (textLayer?.text ?? "");
  const textBlank = textValue.trim() === "";

  const key = (control: string) => `${layerId}:${control}`;
  const setSkew = (axis: "skewX" | "skewY", deg: number) => {
    onTransform({ ...transform, [axis]: degToSkew(deg) }, key(axis));
  };

  /** Contain-fit into the print area, keeping the box's shape; rotation and skew reset. */
  const fitToArea = () => {
    const fitted = fitTransform(area.rect, transform.width, transform.height);
    onTransform({ ...fitted, flipX: transform.flipX });
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
    // Resize around the box's center so the layer doesn't jump.
    const w = Math.min(5000, Math.max(1, width));
    const h = Math.min(5000, Math.max(1, height));
    onTransform({
      ...transform,
      x: transform.x + (transform.width - w) / 2,
      y: transform.y + (transform.height - h) / 2,
      width: w,
      height: h,
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
                {textValue.length}/60
              </span>
            </div>
            <Input
              id="text-layer-input"
              type="text"
              value={textValue}
              maxLength={60}
              aria-invalid={textBlank || undefined}
              aria-describedby={textBlank ? "text-layer-empty" : undefined}
              data-testid="text-layer-input"
              onChange={(e) => {
                const text = e.target.value;
                setTextDraft({ layerId, text });
                if (text.trim() !== "") onTextChange({ text }, key("text"));
              }}
              onBlur={() => setTextDraft(null)}
            />
            {textBlank ? (
              <p id="text-layer-empty" className="text-text-3 mt-1 text-xs">
                Type something, or delete this text from the layers list.
              </p>
            ) : null}
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
                  <SelectItem key={font.id} value={font.id}>
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
              onChange={(e) => onTextChange({ color: e.target.value }, key("color"))}
              className="h-9 w-12 cursor-pointer rounded-md border p-0.5"
              data-testid="text-layer-color"
            />
            <HexInput
              value={textLayer.color}
              label="Ink color hex"
              onCommit={(color) => onTextChange({ color }, key("color"))}
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
              onChange={(e) =>
                onOutlineChange(
                  { color: e.target.value, width: textLayer.outline.width || OUTLINE_WIDTHS[1]!.width },
                  key("outline-color"),
                )
              }
              className="h-9 w-12 cursor-pointer rounded-md border p-0.5"
              data-testid="text-layer-outline-color"
            />
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
              onChange={(e) => onTextChange({ letterSpacing: Number(e.target.value) }, key("spacing"))}
              className="w-full accent-[var(--neon-cyan)]"
              data-testid="text-layer-spacing"
            />
          </div>
        </>
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
        <DraftNumberInput
          id="layer-w"
          inputMode="decimal"
          min={0.25}
          step={0.25}
          value={inches.w}
          format={(v) => v.toFixed(2)}
          aria-label="Width in inches"
          onCommit={(v) => setSizeInches("w", v)}
          className="h-9 w-full text-sm"
          data-testid="layer-w"
        />
        <span aria-hidden="true" className="text-text-3 text-xs">
          ×
        </span>
        <DraftNumberInput
          id="layer-h"
          inputMode="decimal"
          min={0.25}
          step={0.25}
          value={inches.h}
          format={(v) => v.toFixed(2)}
          aria-label="Height in inches"
          onCommit={(v) => setSizeInches("h", v)}
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
          onChange={(e) => onTransform({ ...transform, rotation: Number(e.target.value) }, key("rotate"))}
          className="w-full accent-[var(--neon-cyan)]"
          data-testid="layer-rotate"
        />
        <DraftNumberInput
          min={-180}
          max={180}
          value={transform.rotation}
          format={(v) => String(Math.round(v))}
          aria-label="Rotation in degrees"
          onCommit={(v) => onTransform({ ...transform, rotation: Math.max(-180, Math.min(180, v)) })}
          className="h-9 w-16 text-sm"
        />
        <span aria-hidden="true" className="text-text-3 text-xs">
          °
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <SkewSlider id="horizontal" label="Skew ⇄" deg={skewXDeg} onDeg={(deg) => setSkew("skewX", deg)} />
        <SkewSlider id="vertical" label="Skew ⇅" deg={skewYDeg} onDeg={(deg) => setSkew("skewY", deg)} />
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
        <Button type="button" variant="secondary" size="sm" onClick={fitToArea} data-testid="fit-area">
          Fit to area
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
