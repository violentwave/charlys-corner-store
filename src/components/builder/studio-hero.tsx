/**
 * The studio hero band (P52-2b, from the Figma reference): a compact sunset scene — sun
 * disc with scanline cuts, palm silhouettes, a perspective grid floor and the chrome
 * heading — over the builder on Home and the cart page. Pure CSS/SVG (no raster images);
 * all decoration is aria-hidden and nothing moves under reduced motion (it never animates).
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { PalmSilhouette } from "@/components/neon/palms";
import { cn } from "@/lib/cn";

export function StudioHero({
  id,
  eyebrow = "The custom apparel studio",
  title = "Build-Your-Own Mockup",
  subtitle = "Pick your blank. Make it yours. We'll take it from there.",
  uploadLink = true,
  note,
  /**
   * Home already owns an h1 (the existing page title) — the visible chrome title is then
   * an h2 and this sr-only h1 carries the page's accessible name. /cart passes h1.
   */
  srTitle,
  titleAs: Title = "h1",
  /** Home: the hero carries #design, so its visible title is the section's focus target. */
  sectionHeading = false,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** The builder's "already ordered?" shortcut (Home only). */
  uploadLink?: boolean;
  /** A small promo line under the subhead (the Home coupon promise). */
  note?: ReactNode;
  srTitle?: string;
  titleAs?: "h1" | "h2";
  sectionHeading?: boolean;
  className?: string;
}) {
  return (
    <section id={id} className={cn("border-border relative isolate scroll-mt-16 overflow-hidden border-b", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-studio-hero absolute inset-0" />
        {/* Sunset disc with the reference's scanline cuts. */}
        <div className="bg-studio-sun absolute top-4 right-[7%] hidden h-32 w-32 rounded-full [mask-image:linear-gradient(#fff_0_54%,transparent_54%_58%,#fff_58%_65%,transparent_65%_70%,#fff_70%_76%,transparent_76%_82%,#fff_82%_87%,transparent_87%_93%,#fff_93%_97%,transparent_97%)] opacity-80 sm:block" />
        {/* Perspective grid floor. */}
        <div className="absolute inset-x-0 bottom-0 h-24 overflow-hidden">
          <div className="bg-studio-grid absolute inset-0 [transform-origin:bottom_center] [transform:perspective(160px)_rotateX(54deg)] [mask-image:linear-gradient(transparent_18%,#fff_62%)]" />
        </div>
        {/* Palms (hidden on the narrowest screens so the heading keeps its room). */}
        <div className="absolute -right-1 -bottom-10 hidden opacity-80 min-[480px]:block">
          <PalmSilhouette side="right" className="text-neon-purple/50 h-44 w-28" />
        </div>
        <div className="absolute -right-6 -bottom-12 hidden opacity-60 sm:block">
          <PalmSilhouette side="left" className="text-neon-pink/40 h-36 w-24" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 py-9 sm:py-12">
        <p className="text-neon-pink flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.22em] uppercase">
          <span aria-hidden="true" className="bg-neon-pink h-px w-5" />
          {eyebrow}
        </p>
        {srTitle ? <h1 className="sr-only">{srTitle}</h1> : null}
        <Title
          tabIndex={sectionHeading ? -1 : undefined}
          data-section-heading={sectionHeading ? "" : undefined}
          className={cn(
            "font-heading text-gradient-chrome mt-2 text-3xl font-black tracking-wide uppercase sm:text-5xl",
            srTitle && "block",
          )}
        >
          {title}
        </Title>
        <p className="text-text-2 mt-3 max-w-xl text-sm sm:text-base">{subtitle}</p>
        {note ? <p className="text-text-2 mt-2 text-xs">{note}</p> : null}
        {uploadLink ? (
          <p className="text-text-3 mt-2 text-xs">
            Already ordered?{" "}
            <Link href="#upload" className="text-neon-cyan underline-offset-4 hover:underline">
              Upload your artwork ↓
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
