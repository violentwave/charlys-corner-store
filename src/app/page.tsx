import Image from "next/image";
import { site } from "@/lib/site";

/**
 * Phase 0 placeholder: proves the theme, fonts, and assets wire up.
 * Replaced by the real Home in Roadmap Phase 2.
 */
export default function Home() {
  return (
    <div className="bg-horizon relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-6 py-20 text-center">
      <Image
        src="/brand/logo.png"
        alt={`${site.name} logo`}
        width={1536}
        height={1024}
        priority
        className="h-auto w-full max-w-xl drop-shadow-[0_0_24px_rgb(255_46_151/0.45)]"
      />
      <h1 className="font-heading text-2xl font-bold tracking-wider uppercase sm:text-4xl">
        <span className="text-gradient-vice">New site loading…</span>
      </h1>
      <p className="text-text-2 max-w-md">
        Custom tees, hats, hoodies &amp; promo products in {site.city}, {site.region}. Questions or orders? Email{" "}
        <a href={`mailto:${site.email}`} className="text-neon-cyan hover:shadow-glow-cyan underline underline-offset-4">
          {site.email.toLowerCase()}
        </a>
        .
      </p>
      <p className="font-heading text-neon-yellow text-sm tracking-widest uppercase">{site.tagline} 🐾</p>
    </div>
  );
}
