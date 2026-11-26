"use client";
/**
 * "Continue with Google" (docs/02 Members v2). A plain link: /api/auth/google/start?next=…
 * starts the OIDC + PKCE flow and Google's callback brings the visitor back. Rendered
 * above the email form with an "or" divider — only when /api/auth/me reports the Google
 * OAuth client is configured (providers.google). Google's button brand rules apply here
 * (white, the four-color G) — the neon theme doesn't.
 */
import { useEffect, useState } from "react";

export interface GoogleButtonProps {
  /** Where a completed sign-in (or the 2FA handoff) lands, e.g. "/account#security" or "/#design". */
  next: string;
  /** When the caller already knows /api/auth/me's answer, skip the fetch. */
  googleEnabled?: boolean;
}

export function GoogleButton({ next, googleEnabled }: GoogleButtonProps) {
  // When the caller knows the answer, it wins; otherwise one /api/auth/me fetch decides.
  const [fetched, setFetched] = useState<boolean | null>(null);
  const enabled = googleEnabled ?? fetched ?? false;

  useEffect(() => {
    if (googleEnabled !== undefined) return;
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { providers?: { google?: boolean } } | null;
        if (alive) setFetched(data?.providers?.google === true);
      })
      .catch(() => {
        if (alive) setFetched(false);
      });
    return () => {
      alive = false;
    };
  }, [googleEnabled]);

  if (!enabled) return null;
  return (
    <>
      <a
        href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
        data-testid="google-button"
        className="focus-visible:ring-neon-cyan flex h-11 w-full items-center justify-center gap-3 rounded-full border border-[#dadce0] bg-white px-4 text-sm font-medium text-[#3c4043] transition-colors hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* Google's "G" mark (brand SVG). */}
        <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px]">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
          />
          <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32z" />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
          />
        </svg>
        Continue with Google
      </a>

      <div role="separator" aria-label="or" className="text-text-3 flex items-center gap-3 text-xs">
        <span aria-hidden="true" className="border-border h-px flex-1 border-t" />
        or
        <span aria-hidden="true" className="border-border h-px flex-1 border-t" />
      </div>
    </>
  );
}
