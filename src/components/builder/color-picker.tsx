"use client";
import { useEffect, useRef } from "react";

import { findCombo, type GarmentConfig } from "@/lib/garments";

import { cn } from "@/lib/cn";

export interface ColorPickerProps {
  garment: GarmentConfig;
  /** Zone id → hex. */
  colors: Record<string, string>;
  onZoneColor: (zone: string, hex: string) => void;
}

type StripItem = { key: string; name: string; swatch: string[] };

/**
 * Step 2: "Choose its color". Only colors the real blank comes in (docs/04 §2):
 * - single-color garments: one hue-sorted strip of every blank color for the style;
 * - combo garments (raglan, trucker hat): one strip of the manufacturer's real combos, where a
 *   pick sets every part at once (no mix-and-match).
 * Arrow keys move the selection, Home/End jump; each chip is a button with aria-label = color
 * name and aria-pressed.
 */
export function ColorPicker({ garment, colors, onZoneColor }: ColorPickerProps) {
  const zones = garment.colorZones.map((z) => z.id);
  return (
    <div className="flex flex-col gap-6">
      {garment.combos.length > 0 ? (
        <ColorStrip
          id="combo"
          label="Color combo"
          items={garment.combos.map((c) => ({ key: c.name, name: c.name, swatch: zones.map((z) => c.colors[z]!) }))}
          selectedKey={(findCombo(garment, colors) ?? garment.combos[0]!).name}
          countLabel={`${garment.combos.length} combos`}
          onPick={(key) => {
            const combo = garment.combos.find((c) => c.name === key)!;
            for (const zone of zones) onZoneColor(zone, combo.colors[zone]!);
          }}
        />
      ) : (
        garment.colorZones.map((zone) => {
          const current = colors[zone.id] ?? garment.defaultColors[zone.id];
          const selected = garment.palette.find((c) => c.hex === current) ?? garment.palette[0]!;
          return (
            <ColorStrip
              key={zone.id}
              id={zone.id}
              label={`${zone.label} color`}
              items={garment.palette.map((c) => ({ key: c.hex, name: c.name, swatch: [c.hex] }))}
              selectedKey={selected.hex}
              countLabel={`${garment.palette.length} colors`}
              onPick={(hex) => onZoneColor(zone.id, hex)}
            />
          );
        })
      )}
      <p className="text-text-3 text-xs" role="note">
        {garment.blank} colors. What you see on screen is close to the real blank; we&apos;ll confirm before printing.
      </p>
    </div>
  );
}

function swatchBackground(swatch: string[]): string {
  if (swatch.length === 1) return swatch[0]!;
  // Combos: one slice per part (body/sleeves, or front/mesh/brim).
  const step = 100 / swatch.length;
  return `linear-gradient(135deg, ${swatch.map((hex, i) => `${hex} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
}

function ColorStrip({
  id,
  label,
  items,
  selectedKey,
  countLabel,
  onPick,
}: {
  id: string;
  label: string;
  items: StripItem[];
  selectedKey: string;
  countLabel: string;
  onPick: (key: string) => void;
}) {
  const selectedIndex = Math.max(
    0,
    items.findIndex((i) => i.key === selectedKey),
  );
  const selected = items[selectedIndex]!;
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the selected chip scrolled into view (first paint, garment switch, arrow keys).
  useEffect(() => {
    // scrollIntoView is missing in jsdom.
    chipRefs.current[selectedIndex]?.scrollIntoView?.({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedIndex]);

  const moveTo = (index: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    onPick(items[clamped]!.key);
    chipRefs.current[clamped]?.focus();
  };

  // Keyboard events bubble here from the focused chip.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: selectedIndex + 1,
      ArrowLeft: selectedIndex - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      moveTo(moves[event.key]!);
    }
  };

  return (
    <div role="group" aria-label={label} data-testid={`zone-${id}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-text-1 text-sm font-medium" data-testid={`color-name-${id}`} aria-live="polite">
          {selected.name}
        </p>
        <p className="text-text-3 text-xs">{countLabel}</p>
      </div>
      <div
        onKeyDown={onKeyDown}
        className="border-border -mx-1 flex [scrollbar-width:thin] gap-1.5 overflow-x-auto px-1 py-1"
        data-testid={`color-strip-${id}`}
      >
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.key}
              ref={(el) => {
                chipRefs.current[index] = el;
              }}
              type="button"
              aria-label={item.name}
              aria-pressed={isSelected}
              title={item.name}
              onClick={() => onPick(item.key)}
              className={cn(
                "focus-visible:ring-neon-cyan focus-visible:ring-offset-bg-0 relative h-9 w-9 shrink-0 snap-center rounded-full border border-black/15 transition-transform focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                isSelected ? "ring-neon-cyan ring-offset-bg-0 z-10 ring-2 ring-offset-2" : "hover:scale-110",
              )}
              style={{ background: swatchBackground(item.swatch) }}
            >
              {isSelected ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0 flex items-center justify-center text-xs font-bold",
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
    </div>
  );
}
