import * as React from "react";

import { cn } from "@/lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => {
    const isInvalid = invalid === true || props["aria-invalid"] === true || props["aria-invalid"] === "true";

    return (
      <textarea
        ref={ref}
        className={cn(
          "bg-bg-3 text-text-1 placeholder:text-text-3 focus-visible:ring-neon-cyan focus-visible:ring-offset-bg-0 min-h-24 w-full rounded-md border px-3 py-2 text-base transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50",
          isInvalid ? "border-danger" : "border-border",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
