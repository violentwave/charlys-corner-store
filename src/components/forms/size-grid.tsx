"use client";
/**
 * The sizes/quantities grid, shared by the builder's order card, "Order again" and the
 * size-set editor. Numbers only, 0 allowed; the caller owns the values.
 */
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SizeGrid({
  sizes,
  values,
  onChange,
  idPrefix,
  label = "Sizes and quantities",
}: {
  sizes: readonly string[];
  values: Record<string, number>;
  onChange: (size: string, qty: number) => void;
  /** Unique per grid so labels bind. */
  idPrefix: string;
  label?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-text-1 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {sizes.map((size) => (
          <Field key={size} label={size} controlId={`${idPrefix}-size-${size}`} className="gap-1">
            <Input
              id={`${idPrefix}-size-${size}`}
              name={`${idPrefix}-size-${size}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={10000}
              step={1}
              value={values[size] ?? 0}
              onChange={(e) => onChange(size, Number(e.target.value))}
              className="h-11 w-full text-sm"
              data-testid={`${idPrefix}-size-${size}`}
            />
          </Field>
        ))}
      </div>
    </fieldset>
  );
}
