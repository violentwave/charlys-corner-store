"use client";

import { Controller, type Control, type FieldErrors, useWatch } from "react-hook-form";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REFERRAL_SOURCES, referralLabels, type ReferralInput } from "@/lib/schemas";

export interface ReferralFieldsProps {
  control: Control<ReferralInput>;
  errors?: FieldErrors<ReferralInput>;
  disabled?: boolean;
}

export function ReferralFields({ control, errors, disabled }: ReferralFieldsProps) {
  const source = useWatch({ control, name: "referralSource" });

  return (
    <>
      <Controller
        control={control}
        name="referralSource"
        render={({ field }) => (
          <Field label="How did you hear about us?" error={errors?.referralSource?.message}>
            <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={disabled}>
              <SelectTrigger>
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {REFERRAL_SOURCES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {referralLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />

      {source === "other" ? (
        <Controller
          control={control}
          name="referralOther"
          render={({ field }) => (
            <Field label="If Other please specify" error={errors?.referralOther?.message}>
              <Input
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
                disabled={disabled}
                placeholder="Tell us how"
              />
            </Field>
          )}
        />
      ) : null}
    </>
  );
}
