"use client";

import { useState } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS = [
  { value: "search", label: "Internet Search" },
  { value: "ad", label: "Advertisement" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

export function ReferralSurveyDemo() {
  const [value, setValue] = useState<string>("");

  return (
    <div className="flex flex-col gap-4">
      <Field label="How did you hear about this site?" hint="Optional in forms; required on the legacy home page.">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {value === "other" ? (
        <Field label="If Other please specify">
          <Input placeholder="Tell us how" />
        </Field>
      ) : null}
    </div>
  );
}
