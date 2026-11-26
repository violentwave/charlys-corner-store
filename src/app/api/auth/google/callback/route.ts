import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  exchangeCode,
  GOOGLE_COOKIE,
  googleConfig,
  resolveGoogleUser,
  safeNext,
  type GoogleFlow,
} from "@/lib/auth/google";
import { signInOrChallenge } from "@/lib/auth/two-factor";
import { getDb } from "@/lib/db";
import { site } from "@/lib/site";

function readFlow(raw: string | undefined): GoogleFlow | null {
  if (!raw || raw.length > 2000) return null;
  try {
    const flow = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GoogleFlow;
    return typeof flow.state === "string" && typeof flow.verifier === "string" && typeof flow.nonce === "string"
      ? { ...flow, next: safeNext(flow.next) }
      : null;
  } catch {
    return null;
  }
}

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Google sends the visitor back here. Checks state (CSRF) and the ID token, finds or creates
 * the member (src/lib/auth/google.ts), then signs in, or hands off to the 2FA screen.
 */
export async function GET(request: Request) {
  const go = (path: string) => NextResponse.redirect(new URL(path, site.url));
  const store = await cookies();
  const flow = readFlow(store.get(GOOGLE_COOKIE)?.value);
  store.delete(GOOGLE_COOKIE);

  const config = googleConfig();
  if (!config) return go("/login?error=google_unavailable");
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!flow || !state || !sameText(state, flow.state)) return go("/login?error=google");
  if (params.get("error") || !code) return go("/login?error=google_cancelled");

  const identity = await exchangeCode(config, code, flow).catch(() => null);
  if (!identity) return go("/login?error=google");

  const db = getDb();
  try {
    const user = await resolveGoogleUser(db, identity);
    const outcome = await signInOrChallenge(db, user);
    if (!outcome.signedIn) return go(`/login?step=2fa&next=${encodeURIComponent(flow.next)}`);
  } catch {
    return go("/login?error=google");
  }
  return go(flow.next);
}
