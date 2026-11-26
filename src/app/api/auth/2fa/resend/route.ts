import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { pendingChallenge, sendTwoFactorEmailCode } from "@/lib/auth/two-factor";
import { getDb } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/** Email 2FA: send a new sign-in code for the pending challenge. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const pending = await pendingChallenge(db);
  if (!pending) return fail("Your sign-in timed out. Please sign in again.", 401);
  if (pending.user.twoFactorMethod !== "email") return fail("Use the code from your authenticator app.", 400);
  const rl = await rateLimit(db, { key: `2fa-resend:${pending.user.id}`, ...LIMITS.resendCode });
  if (!rl.ok) return fail("We've sent a few codes already. Check your inbox (and spam) or try later.", 429);
  const sent = await sendTwoFactorEmailCode(db, pending.user, "sign-in");
  if (!sent) return fail("We couldn't send the email. Please try again in a minute.", 502);
  return NextResponse.json({ ok: true });
}
