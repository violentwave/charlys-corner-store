"use client";
/**
 * Selected-layer controls (docs/04 §3, simple-panel pass 2026-11-26). The everyday
 * controls are visible — text, font, quick inks, and the action row — and everything
 * else is one tap away in two <details> disclosures: Text style (outline, arch,
 * spacing; text only) and Size & rotation (inches + lock, rotate). Each disclosure
 * remembers open/closed for the session (sessionStorage; component state is fine).
 *
 * Text is one line scaled to fill its box, so alignment would do nothing: the schema keeps
 * `align` (default center) but there is no control for it. Skew was removed (Logan,
 * 2026-11-26). Every change passes a `mergeKey` (layer + control) so one slider drag or
 * one burst of typing is one undo step. Free-typed fields (text, hex, numbers) keep a
 * local draft and only commit valid values, so the design never holds an empty text or a
 * NaN.
 */
import { useState } from "react";

import { TEXT_FONTS, type TextFontId } from "@/lib/text-fonts";
import { luma, printedInches, type PrintArea } from "@/lib/garments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";

import { centerInRect, fitIntoRect, resizeAroundCenter, setRotationAroundCenter } from "./geometry";
import type { BuilderImageLayer, BuilderTextLayer, BuilderTransform, TextPatch } from "./use-builder-state";

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

const OUTLINE_WIDTHS = [
  { label: "None", width: 0 },
  { label: "Thin", width: 2 },
  { label: "Medium", width: 4 },
  { label: "Thick", width: 7 },
];

/** Quick inks for text: plain hex constants, not a claim about stocked thread or vinyl. */
const QUICK_INKS = [
  { label: "Black", hex: "#000000" },
  { label: "White", hex: "#ffffff" },
  { label: "Red", hex: "#ff0000" },
  { label: "Royal blue", hex: "#4169e1" },
  { label: "Navy", hex: "#000080" },
  { label: "Kelly green", hex: "#4cbb17" },
  { label: "Gold", hex: "#ffd700" },
  { label: "Hot pink", hex: "#ff69b4" },
] as const;

/** Disclosure with a chevron, quiet row styling and session memory (P48-2). */
function InspectorDisclosure({
  label,
  testid,
  children,
}: {
  label: string;
  testid: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(`${testid}-open`) === "1";
    } catch {
      return false;
    }
  });
  return (
    <details
      open={open}
      data-testid={testid}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        try {
          sessionStorage.setItem(`${testid}-open`, next ? "1" : "0");
        } catch {
          // private mode: the open state just lives for this mount
        }
      }}
      className="group border-border border-t pt-3"
    >
      <summary
        className={cn(
          "text-text-2 hover:text-text-1 flex min-h-6 cursor-pointer list-none items-center justify-between gap-2 text-xs [&::-webkit-details-marker]:hidden",
          "focus-visible:ring-neon-cyan rounded-sm focus-visible:ring-2 focus-visible:outline-none",
        )}
      >
        {label}
        <span aria-hidden="true" className="transition-transform duration-150 group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

export interface LayerControlsProps {
  area: PrintArea;
  imageLayer?: BuilderImageLayer;
  textLayer?: BuilderTextLayer;
  /** The member's brand kit inks — shown before the quick defaults ("Your colors"). */
  brandInks?: string[];
  /** The member's brand fonts — the select's first group ("Your fonts"). */
  brandFonts?: TextFontId[];
  /** The Transformer's lock-ratio toggle (shared with the canvas, owned by the builder). */
  lockRatio: boolean;
  onLockRatioChange: (lock: boolean) => void;
  /** `mergeKey` groups a run of changes from one control into one undo step. */
  onTransform: (transform: BuilderTransform, mergeKey?: string) => void;
  onTextChange: (patch: TextPatch, mergeKey?: string) => void;
  onOutlineChange: (outline: { color: string; width: number }, mergeKey?: string) => void;
  /** Action-row handlers, pre-bound to the selected layer (the rows list has them too). */
  onDuplicate: () => void;
  onRemove: () => void;
}

export function LayerControls({
  area,
  imageLayer,
  textLayer,
  brandInks,
  brandFonts,
  lockRatio,
  onLockRatioChange,
  onTransform,
  onTextChange,
  onOutlineChange,
  onDuplicate,
  onRemove,
}: LayerControlsProps) {
  const transform = (imageLayer ?? textLayer)!.transform;
  const layerId = (imageLayer ?? textLayer)!.id;
  const inches = printedInches(area, { w: transform.width, h: transform.height });
  /** The text box's draft: may be empty while typing; only non-blank text is committed. */
  const [textDraft, setTextDraft] = useState<{ layerId: string; text: string } | null>(null);
  const textValue = textDraft?.layerId === layerId ? textDraft.text : (textLayer?.text ?? "");
  const textBlank = textValue.trim() === "";
  /** "Custom" ink: the color input + hex field stay folded until asked for (or needed). */
  const [customInkOpen, setCustomInkOpen] = useState(
    () => textLayer !== undefined && !QUICK_INKS.some((c) => c.hex === textLayer.color.toLowerCase()),
  );

  const key = (control: string) => `${layerId}:${control}`;

  /** Scales the layer (shape, rotation and skew kept) so all of it fits the print area, centered. */
  const fitToArea = () => onTransform(fitIntoRect(transform, area.rect));

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
    // Resize around the box's (rotated) center so the layer doesn't jump.
    onTransform(resizeAroundCenter(transform, width, height));
  };

  const actionButton = (label: string, glyph: string, onClick: () => void, testid: string, danger = false) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      data-testid={testid}
      className={cn("h-9 px-3 text-xs", danger && "text-danger hover:text-danger")}
      aria-label={danger ? `${label} this layer` : label}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {glyph}
      </span>
      {label}
    </Button>
  );

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
                Type something, or delete this text from the action row.
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
                {brandFonts && brandFonts.length > 0 ? (
                  <>
                    <p className="text-text-3 px-2 pt-1.5 text-[10px] tracking-widest uppercase" role="presentation">
                      Your fonts
                    </p>
                    <SelectGroup>
                      {brandFonts.map((id) => {
                        const font = TEXT_FONTS.find((f) => f.id === id);
                        if (!font) return null;
                        return (
                          <SelectItem key={font.id} value={font.id}>
                            <span style={{ fontFamily: `"${font.family}"`, fontWeight: font.weight }}>
                              {font.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                    <p className="text-text-3 px-2 pt-1.5 text-[10px] tracking-widest uppercase" role="presentation">
                      All fonts
                    </p>
                  </>
                ) : null}
                {TEXT_FONTS.filter((font) => !brandFonts?.includes(font.id)).map((font) => (
                  <SelectItem key={font.id} value={font.id}>
                    <span style={{ fontFamily: `"${font.family}"`, fontWeight: font.weight }}>{font.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2">
            <span className="text-text-2 w-14 shrink-0 pt-1.5 text-xs" id="ink-swatches-label">
              Ink
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div
                role="group"
                aria-labelledby="ink-swatches-label"
                className="flex flex-col gap-1.5"
                data-testid="ink-swatches"
              >
                {brandInks && brandInks.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="brand-inks">
                    <span className="text-text-3 w-full text-[10px] tracking-widest uppercase">Your colors</span>
                    {brandInks.map((hex) => {
                      const active = textLayer.color.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          aria-pressed={active}
                          aria-label={`Your ink ${hex}`}
                          title={`Your color ${hex}`}
                          data-testid={`brand-ink-${hex.replace("#", "")}`}
                          onClick={() => {
                            setCustomInkOpen(false);
                            onTextChange({ color: hex.toLowerCase() }, key("color"));
                          }}
                          className={cn(
                            "focus-visible:ring-neon-cyan h-7 w-7 shrink-0 rounded-full border transition-shadow focus-visible:ring-2 focus-visible:outline-none",
                            active
                              ? "border-border-strong ring-neon-cyan ring-offset-bg-0 ring-2 ring-offset-2"
                              : "border-border hover:border-border-strong",
                          )}
                          style={{ backgroundColor: hex }}
                        >
                          <span className="sr-only">{active ? " (selected)" : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  {brandInks && brandInks.length > 0 ? (
                    <span className="text-text-3 w-full text-[10px] tracking-widest uppercase">Quick colors</span>
                  ) : null}
                  {QUICK_INKS.map(({ label, hex }) => {
                    const active = textLayer.color.toLowerCase() === hex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        aria-pressed={active}
                        aria-label={`Ink: ${label}`}
                        title={label}
                        data-testid={`ink-${label.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => {
                          setCustomInkOpen(false);
                          onTextChange({ color: hex }, key("color"));
                        }}
                        className={cn(
                          "focus-visible:ring-neon-cyan h-7 w-7 shrink-0 rounded-full border transition-shadow focus-visible:ring-2 focus-visible:outline-none",
                          active
                            ? "border-border-strong ring-neon-cyan ring-offset-bg-0 ring-2 ring-offset-2"
                            : "border-border hover:border-border-strong",
                        )}
                        style={{ backgroundColor: hex }}
                      >
                        <span className="sr-only">{active ? " (selected)" : ""}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-expanded={customInkOpen}
                    aria-label="Custom ink color"
                    data-testid="ink-custom"
                    onClick={() => setCustomInkOpen((v) => !v)}
                    className={cn(
                      "border-border bg-bg-3 text-text-2 hover:text-text-1 focus-visible:ring-neon-cyan flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs focus-visible:ring-2 focus-visible:outline-none",
                      customInkOpen && "border-neon-cyan text-neon-cyan",
                    )}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
              </div>
              {customInkOpen ? (
                <div className="flex items-center gap-2" data-testid="custom-ink">
                  <input
                    aria-label="Ink color picker"
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
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {/* Every layer: one action row (the layers list repeats duplicate/delete per row). */}
      <div role="group" aria-label="Layer actions" className="flex flex-wrap gap-1" data-testid="layer-actions">
        {actionButton("Center", "◎", () => onTransform(centerInRect(transform, area.rect)), "action-center")}
        {actionButton("Fit", "⤢", fitToArea, "action-fit")}
        {actionButton("Flip", "⇄", () => onTransform({ ...transform, flipX: !transform.flipX }), "action-flip")}
        {actionButton("Duplicate", "⧉", onDuplicate, "action-duplicate")}
        {actionButton("Delete", "×", onRemove, "action-delete", true)}
      </div>

      {textLayer ? (
        <InspectorDisclosure label="Text style" testid="text-style-section">
          <div className="flex items-center gap-2">
            <label htmlFor="text-layer-outline" className="text-text-2 w-14 shrink-0 text-xs">
              Outline
            </label>
            <Select
              value={String(textLayer.outline.width)}
              onValueChange={(width) =>
                onOutlineChange({
                  // An outline the same color as the letters is invisible: start it in a contrasting color.
                  color:
                    textLayer.outline.color.toLowerCase() === textLayer.color.toLowerCase()
                      ? luma(textLayer.color) < 0.5
                        ? "#ffffff"
                        : "#000000"
                      : textLayer.outline.color,
                  width: Number(width),
                })
              }
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

          <div className="flex items-center gap-2">
            <label htmlFor="text-layer-curve" className="text-text-2 w-14 shrink-0 text-xs">
              Arch
            </label>
            <input
              id="text-layer-curve"
              type="range"
              min={-100}
              max={100}
              step={5}
              value={Math.round(textLayer.curve * 100)}
              aria-valuetext={
                Math.abs(textLayer.curve) < 0.01
                  ? "Straight"
                  : `Arched ${textLayer.curve > 0 ? "up" : "down"} ${Math.round(Math.abs(textLayer.curve) * 100)} percent`
              }
              onChange={(e) => onTextChange({ curve: Number(e.target.value) / 100 }, key("curve"))}
              className="w-full accent-[var(--neon-cyan)]"
              data-testid="text-layer-curve"
            />
            <span className="text-text-3 w-14 shrink-0 text-right text-xs">
              {Math.abs(textLayer.curve) < 0.01 ? "Straight" : textLayer.curve > 0 ? "Up" : "Down"}
            </span>
          </div>
        </InspectorDisclosure>
      ) : null}

      <InspectorDisclosure label="Size & rotation" testid="size-rotation-section">
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
            onChange={(e) => onTransform(setRotationAroundCenter(transform, Number(e.target.value)), key("rotate"))}
            className="w-full accent-[var(--neon-cyan)]"
            data-testid="layer-rotate"
          />
          <DraftNumberInput
            min={-180}
            max={180}
            value={transform.rotation}
            format={(v) => String(Math.round(v))}
            aria-label="Rotation in degrees"
            onCommit={(v) => onTransform(setRotationAroundCenter(transform, Math.max(-180, Math.min(180, v))))}
            className="h-9 w-16 text-sm"
          />
          <span aria-hidden="true" className="text-text-3 text-xs">
            °
          </span>
        </div>
      </InspectorDisclosure>
    </div>
  );
}
