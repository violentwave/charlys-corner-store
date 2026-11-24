import { Label } from "@radix-ui/react-label";
import * as React from "react";

import { cn } from "@/lib/cn";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /**
   * Set this when the child doesn't render the focusable element itself (e.g. Radix `Select`,
   * whose focusable element is `SelectTrigger`). Field then leaves the child untouched and the
   * caller wires the inner control with `fieldControlProps(controlId, { hint, error, required })`.
   */
  controlId?: string;
  children: React.ReactElement;
}

/** ids Field uses for a control's hint and error text. */
export function fieldIds(controlId: string) {
  return { hintId: `${controlId}-hint`, errorId: `${controlId}-error` };
}

/** ARIA props for a control wired manually inside `<Field controlId=…>`. */
export function fieldControlProps(
  controlId: string,
  { hint, error, required }: { hint?: string; error?: string; required?: boolean },
) {
  const { hintId, errorId } = fieldIds(controlId);
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return {
    id: controlId,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-required": required ? true : undefined,
  };
}

export function Field({
  label,
  hint,
  error,
  required,
  controlId: explicitId,
  children,
  className,
  ...props
}: FieldProps) {
  const reactId = React.useId();
  const childProps = children.props as { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | string };
  const controlId = explicitId ?? childProps.id ?? `field-${reactId}`;
  const { hintId: hintIdBase, errorId: errorIdBase } = fieldIds(controlId);
  const hintId = hint ? hintIdBase : undefined;
  const errorId = error ? errorIdBase : undefined;

  const describedBy = [childProps["aria-describedby"], hintId, errorId].filter(Boolean).join(" ");

  const child = explicitId
    ? children
    : React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: controlId,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : childProps["aria-invalid"],
        "aria-required": required ? true : undefined,
      });

  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      <Label htmlFor={controlId} className="text-text-1 flex items-center gap-1 text-sm font-medium">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-neon-pink">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        ) : null}
      </Label>
      {child}
      {hint ? (
        <p id={hintId} className="text-text-3 text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-danger flex items-center gap-1.5 text-xs">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
