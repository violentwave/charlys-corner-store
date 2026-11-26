import { NextResponse } from "next/server";

import { currentMemberRow } from "@/lib/auth/member";
import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { sendTwoFactorEmailCode } from "@/lib/auth/two-factor";
import { getDb } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * Emails a 6-digit code: to turn on email 2FA, or (when email 2FA is already on) to confirm
 * a sensitive change like turning it off or making new backup codes.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const user = await currentMemberRow(db);
  if (!user) return fail("Please log in first.", 401);
  if (user.twoFactorMethod === "totp") return fail("Use the code from your authenticator app.", 400);
  if (!user.emailVerifiedAt) return fail("Confirm your email first.", 403);
  const rl = await rateLimit(db, { key: `2fa-email:${user.id}`, ...LIMITS.resendCode });
  if (!rl.ok) return fail("We've sent a few codes already. Check your inbox (and spam) or try later.", 429);
  const sent = await sendTwoFactorEmailCode(db, user, user.twoFactorMethod ? "sign-in" : "setup");
  if (!sent) return fail("We couldn't send the email. Please try again in a minute.", 502);
  return NextResponse.json({ ok: true });
}
