"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { AccountUser } from "@/lib/auth-schema";

/** Dispatched on window when the session changes without a page navigation. */
export const AUTH_CHANGED_EVENT = "charly:auth-changed";

export type SessionState = {
  /** True until /api/auth/me has answered for the current path — render a neutral skeleton. */
  loading: boolean;
  user: AccountUser | null;
  /** Whether the Google sign-in button should be offered. */
  googleEnabled: boolean;
};

/**
 * Reads the session client-side from GET /api/auth/me (one fetch per route; the response
 * also carries the provider flags for the sign-in buttons). Listens for
 * AUTH_CHANGED_EVENT so sign-in/out that happens without a navigation re-reads it, and
 * re-reads on pathname changes so the header/menu never shows a stale session.
 */
export function useSession(): SessionState {
  const pathname = usePathname();
  // null until the first answer; `path` tags which route the answer belongs to, so
  // navigating to another page re-reads the session (log in / log out flip the UI
  // without a reload).
  const [state, setState] = useState<null | { path: string; user: AccountUser | null; googleEnabled: boolean }>(null);

  useEffect(() => {
    let alive = true;
    const read = () =>
      fetch("/api/auth/me", { cache: "no-store" })
        .then(async (res) => {
          const data = (await res.json().catch(() => null)) as {
            user?: AccountUser | null;
            providers?: { google?: boolean };
          } | null;
          if (alive)
            setState({
              path: pathname,
              user: data?.user ?? null,
              googleEnabled: data?.providers?.google === true,
            });
        })
        .catch(() => {
          if (alive) setState({ path: pathname, user: null, googleEnabled: false });
        });
    void read();
    // Signing in without a navigation (the builder's sign-in dialog) announces itself.
    window.addEventListener(AUTH_CHANGED_EVENT, read);
    return () => {
      alive = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, read);
    };
  }, [pathname]);

  // While the answer is missing or from another path, render nothing member-specific —
  // never the wrong shape (no "Log in" flash for a member, no stale account block).
  const stale = state !== null && state.path !== pathname;
  return {
    loading: state === null || stale,
    user: state === null || stale ? null : state.user,
    googleEnabled: state === null || stale ? false : state.googleEnabled,
  };
}
