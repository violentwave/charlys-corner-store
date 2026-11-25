"use client";
import { useId, useState } from "react";

import { isHexColor, type GarmentConfig } from "@/lib/garments";

import { cn } from "@/lib/cn";

export interface ColorPickerProps {
  garment: GarmentConfig;
  /** Zone id → hex. */
  colors: Record<string, string>;
  onZoneColor: (zone: string, hex: string) => void;
}

/** Normalize "a1b2c3" / "#A1B2C3" to the "#a1b2c3" form the schema expects. */
function normalizeHex(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

/**
 * Step 2: one swatch row per color zone, plus a custom hex picker per zone
 * (docs/04 §2 — multi-zone color is what makes "custom color(s)" real).
 */
export function ColorPicker({ garment, colors, onZoneColor }: ColorPickerProps) {
  return (
    <div className="flex flex-col gap-6">
      {garment.colorZones.map((zone) => (
        <ColorZoneRow
          key={zone.id}
          zoneId={zone.id}
          zoneLabel={zone.label}
          garment={garment}
          current={colors[zone.id] ?? garment.defaultColors[zone.id] ?? "#f4f4f4"}
          onZoneColor={onZoneColor}
        />
      ))}
    </div>
  );
}

function ColorZoneRow({
  zoneId,
  zoneLabel,
  garment,
  current,
  onZoneColor,
}: {
  zoneId: string;
  zoneLabel: string;
  garment: GarmentConfig;
  current: string;
  onZoneColor: (zone: string, hex: string) => void;
}) {
  const id = useId();
  const selectedName = garment.palette.find((c) => c.hex === current)?.name;
  const isCustom = !selectedName;
  // The draft starts empty unless the applied color is already a custom hex (a field
  // pre-filled with a 7-char palette hex can't be typed into). When the applied color
  // changes from outside (swatch click, garment switch), the draft follows it — the
  // "adjust state during render" pattern from react.dev, no sync effect needed.
  const syncKey = isCustom ? current : "";
  const [draft, setDraft] = useState(syncKey);
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey);
    setDraft(syncKey);
  }
  const draftValid = isHexColor(normalizeHex(draft));

  return (
    <div role="group" aria-label={`${zoneLabel} color`} data-testid={`zone-${zoneId}`}>
      <p className="text-text-1 mb-2 text-sm font-medium">{zoneLabel}</p>
      <div className="flex flex-wrap items-center gap-2">
        {garment.palette.map((color) => {
          const selected = color.hex === current;
          return (
            <button
              key={color.hex}
              type="button"
              aria-label={color.name}
              aria-pressed={selected}
              title={color.name}
              onClick={() => onZoneColor(zoneId, color.hex)}
              className={cn(
                "focus-visible:ring-neon-cyan relative h-11 w-11 rounded-full border border-white/25 transition-transform focus-visible:ring-2 focus-visible:outline-none",
                selected ? "ring-neon-cyan ring-offset-bg-0 ring-2 ring-offset-2" : "hover:-translate-y-0.5",
              )}
              style={{ backgroundColor: color.hex }}
            >
              {selected ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0 flex items-center justify-center text-sm font-bold",
                    /* check mark must read on light and dark swatches: dark text + light outline */
                    "text-[color:black] [text-shadow:0_0_2px_white]",
                  )}
                >
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-text-3 mt-1.5 text-xs" aria-live="polite">
        {selectedName ? selectedName : "Custom color"}
      </p>

      {garment.allowCustomHex ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-native`} className="text-text-2 text-xs">
            Custom
          </label>
          <input
            id={`${id}-native`}
            type="color"
            aria-label={`Pick a custom ${zoneLabel} color`}
            value={draftValid ? normalizeHex(draft) : "#f4f4f4"}
            onChange={(e) => {
              setDraft(e.target.value);
              onZoneColor(zoneId, e.target.value);
            }}
            className="border-border h-11 w-11 cursor-pointer rounded-md border p-0.5"
          />
          <input
            id={`${id}-hex`}
            type="text"
            inputMode="text"
            spellCheck={false}
            placeholder="#hex"
            maxLength={7}
            value={draft}
            aria-invalid={!draftValid || undefined}
            aria-label={`Custom ${zoneLabel} hex color`}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              if (isHexColor(normalizeHex(next))) onZoneColor(zoneId, normalizeHex(next));
            }}
            className="border-border bg-bg-3 text-text-1 focus-visible:ring-neon-cyan aria-invalid:border-danger h-11 w-24 rounded-md border px-2 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
          />
          {isCustom && draftValid ? (
            <p className="text-text-2 text-xs">We&apos;ll match the closest available blank.</p>
          ) : null}
          {!draftValid ? (
            <p role="alert" className="text-danger text-xs">
              Use a 6-digit hex like <span className="font-mono">#ff2e97</span>.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
