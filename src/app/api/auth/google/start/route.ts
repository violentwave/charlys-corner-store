import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { authorizationUrl, GOOGLE_COOKIE, GOOGLE_FLOW_MINUTES, googleConfig, safeNext } from "@/lib/auth/google";
import { randomToken } from "@/lib/auth/tokens";
import { getDb } from "@/lib/db";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";

/** GET /api/auth/google/start?next=/path → Google's account chooser. */
export async function GET(request: Request) {
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, site.url));
  const config = googleConfig();
  if (!config) return back("google_unavailable");

  const rl = await rateLimit(getDb(), { key: `google-start:${clientIp(await headers())}`, ...LIMITS.googleStart });
  if (!rl.ok) return back("too_many");

  const flow = {
    state: randomToken(),
    verifier: randomToken(),
    nonce: randomToken(),
    next: safeNext(new URL(request.url).searchParams.get("next")),
  };
  (await cookies()).set(GOOGLE_COOKIE, Buffer.from(JSON.stringify(flow)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax: the cookie comes back on Google's top-level redirect to the callback.
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: GOOGLE_FLOW_MINUTES * 60,
  });
  return NextResponse.redirect(authorizationUrl(config, flow));
}
