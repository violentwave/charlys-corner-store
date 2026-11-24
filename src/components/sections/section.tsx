import * as React from "react";

import { cn } from "@/lib/cn";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
}

export function Section({ id, eyebrow, title, description, className, children, ...props }: SectionProps) {
  return (
    <section id={id} className={cn("py-20 sm:py-28", className)} {...props}>
      <div className="mx-auto w-full max-w-6xl px-6">
        {eyebrow || title || description ? (
          <header className="mb-10 flex flex-col gap-3">
            {eyebrow ? (
              <p className="font-heading text-neon-cyan text-xs tracking-[0.3em] uppercase">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className="font-heading text-text-1 text-2xl tracking-wide uppercase sm:text-3xl">{title}</h2>
            ) : null}
            {description ? <p className="text-text-2 max-w-2xl">{description}</p> : null}
          </header>
        ) : null}
        {children}
      </div>
    </section>
  );
}
