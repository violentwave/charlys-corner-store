"use client";
import Image from "next/image";

import { GARMENTS, type GarmentConfig, type GarmentId } from "@/lib/garments";

import { cn } from "@/lib/cn";

export interface GarmentPickerProps {
  selectedId: GarmentId;
  onSelect: (id: GarmentId) => void;
}

/** Step 1: garment cards with the white base.png composite as thumbnail. */
export function GarmentPicker({ selectedId, onSelect }: GarmentPickerProps) {
  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="garment-picker">
        {GARMENTS.map((garment) => (
          <li key={garment.id}>
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
        "border-border bg-bg-2/85 hover:border-border-strong focus-visible:ring-neon-cyan flex h-full w-full flex-col items-center gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
        selected && "border-neon-cyan ring-neon-cyan ring-2",
      )}
    >
      <span className="bg-builder-backdrop relative w-full overflow-hidden rounded-lg" aria-hidden="true">
        <Image
          src={thumbnailView.layers.base}
          alt=""
          width={200}
          height={Math.round((200 * thumbnailView.height) / thumbnailView.width)}
          className="h-auto w-full"
        />
        {selected ? (
          <span className="bg-neon-cyan text-bg-0 absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold">
            ✓<span className="sr-only">selected</span>
          </span>
        ) : null}
      </span>
      <span className="text-text-1 text-sm font-medium">{garment.name}</span>
      {garment.badge ? (
        <span className="border-neon-cyan/60 text-neon-cyan rounded-full border px-2 py-0.5 text-[11px] font-semibold">
          {garment.badge}
        </span>
      ) : null}
      <span className="text-text-3 text-xs">{garment.description}</span>
    </button>
  );
}
