"use client";
import { GarmentPicker } from "./garment-picker";
import { Button } from "@/components/ui/button";
import type { GarmentId } from "@/lib/garments";

export interface GarmentStepProps {
  selectedId: GarmentId;
  /** Picking a card only selects it (visible selected state) — it does NOT advance (v3). */
  onSelect: (id: GarmentId) => void;
  /** Only "Continue" (or the step pills) moves to the colors step. */
  onContinue: () => void;
}

/**
 * Step 1: "Pick your shirt". Picking a garment selects it; Continue moves on, so a
 * first-time visitor can change their mind before anything else happens.
 */
export function GarmentStep({ selectedId, onSelect, onContinue }: GarmentStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <GarmentPicker selectedId={selectedId} onSelect={onSelect} />
      <Button size="lg" onClick={onContinue} data-testid="garment-continue" className="self-start">
        Continue →
      </Button>
    </div>
  );
}
