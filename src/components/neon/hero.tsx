import * as React from "react";

import { cn } from "@/lib/cn";
import { PalmSilhouette } from "./palms";

export interface HeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Heading level for the title. Use "h2" when the page already has an h1. */
  titleAs?: "h1" | "h2";
  className?: string;
}

export function Hero({ eyebrow, title, subtitle, actions, titleAs: Title = "h1", className }: HeroProps) {
  return (
    <section
      className={cn(
        "bg-horizon relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 py-20 text-center",
        className,
      )}
    >
      {/* sun disk with scanline stripes */}
      <div aria-hidden="true" className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2">
        <div className="bg-sunset shadow-glow-pink h-40 w-40 rounded-full opacity-80 sm:h-56 sm:w-56">
          <div className="bg-scanlines h-full w-full rounded-full" />
        </div>
      </div>

      {/* perspective grid floor */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 overflow-hidden">
        <div
          className="hero-grid bg-neon-grid absolute inset-0 animate-[hero-grid-scroll_9s_linear_infinite] motion-reduce:animate-none"
          style={{ transform: "perspective(420px) rotateX(64deg)", transformOrigin: "bottom center" }}
        />
      </div>

      {/* palms */}
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-2 hidden min-[480px]:block">
        <PalmSilhouette side="left" />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-2 bottom-0 hidden min-[480px]:block">
        <PalmSilhouette side="right" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4">
        {eyebrow ? <p className="font-heading text-neon-cyan text-xs tracking-[0.3em] uppercase">{eyebrow}</p> : null}
        <Title className="font-heading text-gradient-vice text-4xl font-bold tracking-wide uppercase sm:text-6xl">
          {title}
        </Title>
        {subtitle ? <p className="text-text-2 max-w-2xl sm:text-lg">{subtitle}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap justify-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
