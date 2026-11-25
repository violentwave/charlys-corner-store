"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { AccountUser } from "@/lib/auth-schema";
import { cn } from "@/lib/cn";

type Variant = "nav" | "drawer";

const variants: Record<Variant, { link: string; skeleton: string }> = {
  // Nav variant is desktop-only: on mobile the account entry lives in the drawer.
  nav: {
    link: "text-text-2 hover:text-text-1 relative hidden px-3 py-2 text-sm font-medium transition-colors duration-150 lg:inline-flex",
    skeleton: "hidden lg:inline-block",
  },
  drawer: {
    link: "rounded-md px-3 py-3 text-base font-medium transition-colors hover:bg-bg-2 hover:text-text-1",
    skeleton: "inline-block",
  },
};

/**
 * Header account entry. Reads the session client-side from GET /api/auth/me so pages stay
 * cacheable; while it loads we render a neutral, aria-hidden placeholder — never the
 * wrong label (no flash of "Log in" for someone who's signed in).
 */
export function AccountLink({ variant, onNavigate }: { variant: Variant; onNavigate?: () => void }) {
  const pathname = usePathname();
  // null until the first answer; `path` tags which route the answer belongs to, so navigating
  // to another page reads the session again (log in / log out flip the label without a reload).
  const [state, setState] = useState<{ path: string; user: AccountUser | null } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (alive) setState({ path: pathname, user: (data?.user as AccountUser | null) ?? null });
      })
      .catch(() => {
        if (alive) setState({ path: pathname, user: null });
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  const loading = state === null || state.path !== pathname;

  // Neutral placeholder until /api/auth/me answers (skeleton bar, hidden from AT).
  if (loading) {
    return (
      <span
        aria-hidden="true"
        data-testid="account-link-loading"
        className={cn(
          "bg-bg-3 h-4 w-16 animate-pulse rounded-full motion-reduce:animate-none",
          variants[variant].skeleton,
        )}
      />
    );
  }

  const signedIn = state?.user !== null;
  return (
    <Link
      href={signedIn ? "/account" : "/login"}
      aria-current={signedIn && pathname.startsWith("/account") ? "page" : undefined}
      onClick={onNavigate}
      data-testid="account-link"
      className={cn(variants[variant].link, signedIn ? "hover:text-neon-cyan" : "hover:text-text-1")}
    >
      {signedIn ? "My designs" : "Log in"}
    </Link>
  );
}
