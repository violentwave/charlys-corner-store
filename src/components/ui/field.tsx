import { Label } from "@radix-ui/react-label";
import * as React from "react";

import { cn } from "@/lib/cn";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement;
}

export function Field({ label, hint, error, required, children, className, ...props }: FieldProps) {
  const reactId = React.useId();
  const childProps = children.props as { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | string };
  const controlId = childProps.id ?? `field-${reactId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  const describedBy = [childProps["aria-describedby"], hintId, errorId].filter(Boolean).join(" ");

  const child = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    id: controlId,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : childProps["aria-invalid"],
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
