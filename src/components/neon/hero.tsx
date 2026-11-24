import * as React from "react";

import { cn } from "@/lib/cn";
import { PalmSilhouette } from "./palms";

export interface HeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function Hero({ eyebrow, title, subtitle, actions, className }: HeroProps) {
  return (
    <section
      className={cn(
        "bg-horizon relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 py-20 text-center",
        className,
      )}
    >
      {/* sun disk with scanline stripes */}
      <div aria-hidden="true" className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2">
        <div
          className="h-40 w-40 rounded-full opacity-80 sm:h-56 sm:w-56"
          style={{
            background: "var(--grad-sunset)",
            boxShadow: "var(--glow-pink)",
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              background: "repeating-linear-gradient(180deg, transparent 0 6px, rgb(10 10 20 / 0.35) 6px 8px)",
            }}
          />
        </div>
      </div>

      {/* perspective grid floor */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 overflow-hidden">
        <div
          className="hero-grid absolute inset-0 animate-[hero-grid-scroll_9s_linear_infinite] motion-reduce:animate-none"
          style={{
            transform: "perspective(420px) rotateX(64deg)",
            transformOrigin: "bottom center",
            background:
              "repeating-linear-gradient(90deg, rgb(0 240 255 / 0.14) 0 1px, transparent 1px 48px), repeating-linear-gradient(0deg, rgb(0 240 255 / 0.14) 0 1px, transparent 1px 48px)",
          }}
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
        <h1 className="font-heading text-gradient-vice text-4xl font-bold tracking-wide uppercase sm:text-6xl">
          {title}
        </h1>
        {subtitle ? <p className="text-text-2 max-w-2xl sm:text-lg">{subtitle}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap justify-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
