import Link from "next/link";

import { Button } from "@/components/ui/button";
import { site } from "@/lib/site";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <p className="font-heading text-neon-cyan text-xs tracking-[0.3em] uppercase">404</p>
      <h1 className="font-heading text-text-1 text-3xl tracking-wide uppercase sm:text-5xl">
        This page ran off chasing a squirrel
      </h1>
      <p className="text-text-2 max-w-md">
        Charly took off after something more interesting. Let&apos;s get you back to the good stuff.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/shop">Shop</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/contact">Contact</Link>
        </Button>
      </div>
      <a href={`mailto:${site.email}`} className="text-neon-cyan font-mono text-sm underline-offset-4 hover:underline">
        {site.email.toLowerCase()}
      </a>
    </div>
  );
}
