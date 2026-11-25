"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { ReferralFields } from "@/components/forms/referral-fields";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GarmentConfig } from "@/lib/garments";
import { referralSchema, type ReferralInput } from "@/lib/schemas";

import type { BuilderDesign } from "./use-builder-state";

export interface DetailsStepProps {
  garment: GarmentConfig;
  design: BuilderDesign;
  onSize: (size: string, qty: number) => void;
  onNotes: (notes: string) => void;
  onReferral: (referral: ReferralInput) => void;
}

/**
 * Step 4: sizes/quantity grid, notes, and the referral question — optional at this
 * step, all parity with the old "Design Your Own Shirt" page (docs/04 §4).
 */
export function DetailsStep({ garment, design, onSize, onNotes, onReferral }: DetailsStepProps) {
  const form = useForm<ReferralInput>({
    resolver: zodResolver(referralSchema) as unknown as Resolver<ReferralInput>,
    defaultValues: design.referral,
  });

  // Keep the reducer in sync as the visitor answers (referral is optional).
  useEffect(() => {
    const sub = form.watch((values) => {
      onReferral({
        referralSource: values.referralSource || undefined,
        referralOther: values.referralOther || undefined,
      });
    });
    return () => sub.unsubscribe();
  }, [form, onReferral]);

  return (
    <div className="flex flex-col gap-6" data-testid="details-step">
      <fieldset>
        <legend className="text-text-1 mb-2 text-sm font-medium">
          Sizes and quantities <span className="text-text-3 font-normal">(optional)</span>
        </legend>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {garment.sizes.map((size) => (
            <Field key={size} label={size} controlId={`size-${size}`} className="gap-1">
              <Input
                id={`size-${size}`}
                name={`size-${size}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                step={1}
                value={design.sizes[size] ?? 0}
                onChange={(e) => onSize(size, Number(e.target.value))}
                className="h-11 w-full text-sm"
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <Field
        label="Notes for Charly's"
        hint={`Optional — ${design.notes.length}/2000 characters. Tell us about colors, placement tweaks, deadlines, or your own garment.`}
        controlId="builder-notes"
      >
        <Textarea
          id="builder-notes"
          name="builder-notes"
          value={design.notes}
          maxLength={2000}
          rows={4}
          onChange={(e) => onNotes(e.target.value)}
          data-testid="builder-notes"
        />
      </Field>

      <ReferralFields control={form.control} />
    </div>
  );
}
