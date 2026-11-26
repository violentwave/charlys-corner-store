import * as React from "react";

import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {eyebrow ? <p className="font-heading text-neon-cyan text-xs tracking-[0.3em] uppercase">{eyebrow}</p> : null}
      <h1
        tabIndex={-1}
        data-section-heading
        className="font-heading text-text-1 text-3xl tracking-wide uppercase sm:text-4xl"
      >
        {title}
      </h1>
      {description ? <p className="text-text-2 max-w-2xl">{description}</p> : null}
    </header>
  );
}
