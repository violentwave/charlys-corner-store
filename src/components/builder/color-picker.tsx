"use client";
import { useEffect, useRef } from "react";

import type { GarmentConfig } from "@/lib/garments";

import { cn } from "@/lib/cn";

export interface ColorPickerProps {
  garment: GarmentConfig;
  /** Zone id → hex. */
  colors: Record<string, string>;
  onZoneColor: (zone: string, hex: string) => void;
}

/**
 * Step 2: "Choose its color". One horizontal color strip per zone — every Gildan blank
 * for the style (hue-sorted, src/lib/gildan-colors.ts), no free hex entry (docs/04 §2 v2).
 * Arrow keys move the selection, Home/End jump; each chip is a button with aria-label =
 * color name and aria-pressed.
 */
export function ColorPicker({ garment, colors, onZoneColor }: ColorPickerProps) {
  return (
    <div className="flex flex-col gap-6">
      {garment.colorZones.map((zone) => (
        <ColorZoneStrip
          key={zone.id}
          zoneId={zone.id}
          zoneLabel={zone.label}
          garment={garment}
          current={colors[zone.id] ?? garment.defaultColors[zone.id] ?? "#f4f4f4"}
          onZoneColor={onZoneColor}
        />
      ))}
      <p className="text-text-3 text-xs" role="note">
        Colors shown on screen are close to the real blanks; we&apos;ll confirm before printing.
      </p>
    </div>
  );
}

function ColorZoneStrip({
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
  const selected = garment.palette.find((c) => c.hex === current) ?? garment.palette[0]!;
  const selectedIndex = garment.palette.indexOf(selected);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the selected chip scrolled into view (first paint, garment switch, arrow keys).
  useEffect(() => {
    // scrollIntoView is missing in jsdom.
    chipRefs.current[selectedIndex]?.scrollIntoView?.({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedIndex]);

  // Keyboard events bubble here from the focused chip: arrows move the selection,
  // Home/End jump to the ends (docs/04 §2 v2).
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = garment.palette.length - 1;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveTo(selectedIndex + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveTo(selectedIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(last);
        break;
      default:
        break;
    }
  };

  const moveTo = (index: number) => {
    const clamped = Math.max(0, Math.min(garment.palette.length - 1, index));
    const color = garment.palette[clamped]!;
    onZoneColor(zoneId, color.hex);
    chipRefs.current[clamped]?.focus();
  };

  return (
    <div role="group" aria-label={`${zoneLabel} color`} data-testid={`zone-${zoneId}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-text-1 text-sm font-medium" data-testid={`color-name-${zoneId}`} aria-live="polite">
          {selected.name}
        </p>
        <p className="text-text-3 text-xs">{garment.palette.length} colors</p>
      </div>
      <div
        onKeyDown={onKeyDown}
        className="border-border -mx-1 flex [scrollbar-width:thin] gap-1.5 overflow-x-auto px-1 py-1"
        data-testid={`color-strip-${zoneId}`}
      >
        {garment.palette.map((color, index) => {
          const isSelected = color.hex === selected.hex;
          return (
            <button
              key={color.hex}
              ref={(el) => {
                chipRefs.current[index] = el;
              }}
              type="button"
              aria-label={color.name}
              aria-pressed={isSelected}
              title={color.name}
              onClick={() => onZoneColor(zoneId, color.hex)}
              className={cn(
                "focus-visible:ring-neon-cyan focus-visible:ring-offset-bg-0 relative h-9 w-9 shrink-0 snap-center rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                isSelected ? "ring-neon-cyan ring-offset-bg-0 z-10 ring-2 ring-offset-2" : "hover:scale-110",
              )}
              style={{ backgroundColor: color.hex }}
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
