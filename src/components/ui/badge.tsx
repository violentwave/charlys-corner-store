import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/cn";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "border-border bg-bg-3 text-text-2",
      pink: "border-neon-pink bg-neon-pink/15 text-neon-pink",
      cyan: "border-neon-cyan bg-neon-cyan/15 text-neon-cyan",
      yellow: "border-neon-yellow bg-neon-yellow/15 text-neon-yellow",
      green: "border-neon-green bg-neon-green/15 text-neon-green",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant, className }))} {...props} />
));
Badge.displayName = "Badge";

export { Badge, badgeVariants };
