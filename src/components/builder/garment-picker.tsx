"use client";
import Image from "next/image";

import { CheckIcon } from "./studio-icons";
import { GARMENTS, type GarmentConfig, type GarmentId } from "@/lib/garments";

import { cn } from "@/lib/cn";

export interface GarmentPickerProps {
  selectedId: GarmentId;
  onSelect: (id: GarmentId) => void;
}

/** Step 1: garment cards with the white base.png composite as thumbnail (P52-2b card style). */
export function GarmentPicker({ selectedId, onSelect }: GarmentPickerProps) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-text-3 font-mono text-[10px] font-semibold tracking-[0.11em] uppercase">Garment styles</p>
        <p className="text-text-3 font-mono text-[10px]">{String(GARMENTS.length).padStart(2, "0")} options</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="garment-picker">
        {GARMENTS.map((garment) => (
          <li key={garment.id} className="min-w-0">
            <GarmentCard garment={garment} selected={garment.id === selectedId} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      <p className="text-text-2 mt-4 text-sm">
        Have your own garment or a different brand in mind? Tell us in the notes; we&apos;ll print on it.
      </p>
    </div>
  );
}

function GarmentCard({
  garment,
  selected,
  onSelect,
}: {
  garment: GarmentConfig;
  selected: boolean;
  onSelect: (id: GarmentId) => void;
}) {
  const thumbnailView = garment.views[0]!;
  return (
    <button
      type="button"
      onClick={() => onSelect(garment.id)}
      aria-pressed={selected}
      data-testid={`garment-${garment.id}`}
      className={cn(
        "group border-border bg-bg-2 focus-visible:ring-neon-cyan relative flex h-full w-full flex-col overflow-hidden rounded-xl border text-left transition-[border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-neon)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:outline-none",
        selected && "border-neon-cyan shadow-[var(--glow-selected)]",
      )}
    >
      <span
        className="bg-builder-backdrop border-border relative block w-full overflow-hidden border-b"
        aria-hidden="true"
      >
        <Image
          src={thumbnailView.layers.base}
          alt=""
          width={200}
          height={Math.round((200 * thumbnailView.height) / thumbnailView.width)}
          className="h-auto w-full transition-transform duration-[var(--motion-base)] ease-[var(--ease-out-neon)] group-hover:scale-[1.02]"
        />
        {selected ? (
          <span className="bg-neon-cyan text-bg-0 absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full">
            <CheckIcon className="h-3 w-3" />
            <span className="sr-only">selected</span>
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <span className="text-text-1 text-[13px] leading-tight font-semibold">{garment.name}</span>
        <span className="text-text-2 line-clamp-3 text-[11px] leading-snug">{garment.description}</span>
        {garment.badge ? (
          <span className="border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan mt-0.5 inline-block self-start rounded border px-1.5 py-px font-mono text-[9px] leading-tight">
            {garment.badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}
