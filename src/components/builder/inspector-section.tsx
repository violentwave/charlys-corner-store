"use client";
/**
 * Step 3 inspector (docs/04 §3 v4): Side, Add, Layers and Selected-item sections in one
 * calm panel — a heading row, 8px spacing, labels left / values right, one subtle divider
 * between sections, no stacked bordered boxes, one primary action per area.
 */
export function InspectorSection({
  label,
  hint,
  children,
  divider = true,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <section
      className={divider ? "border-border border-t pt-4 first:border-t-0 first:pt-0" : undefined}
      aria-label={label}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-text-1 text-xs tracking-widest uppercase">{label}</h3>
        {hint ? <p className="text-text-3 text-xs">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** One label-left / value-right row of the inspector grid (8px spacing). */
export function InspectorRow({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex min-h-9 items-center gap-2">
      <label htmlFor={htmlFor} className="text-text-2 w-16 shrink-0 text-xs">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}
