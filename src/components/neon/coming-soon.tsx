import Link from "next/link";

import { Button } from "@/components/ui/button";
import { site } from "@/lib/site";

export interface ComingSoonProps {
  title: string;
  /** What this page will do, in one sentence. */
  description: string;
  /** Roadmap phase that builds it, e.g. "Phase 4". */
  phase: string;
}

/** Honest placeholder for routes in the nav that aren't built yet. */
export function ComingSoon({ title, description, phase }: ComingSoonProps) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="font-heading text-neon-cyan text-xs tracking-[0.3em] uppercase">Coming soon · {phase}</p>
      <h1 className="font-heading text-gradient-vice text-3xl font-bold tracking-wide uppercase sm:text-5xl">
        {title}
      </h1>
      <p className="text-text-2">{description}</p>
      <p className="text-text-2">
        Need it now? Email{" "}
        <a href={`mailto:${site.email}`} className="text-neon-cyan underline underline-offset-4">
          {site.email.toLowerCase()}
        </a>{" "}
        and we&apos;ll take care of you.
      </p>
      <Button asChild variant="secondary">
        <Link href="/">Back home</Link>
      </Button>
    </section>
  );
}
