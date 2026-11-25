import { NextResponse } from "next/server";

import { AuthVerifyEmail } from "@/emails/auth-verify";
import { issueVerificationCode, VERIFY_CODE_MINUTES } from "@/lib/auth/email-tokens";
import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sendAccountEmail } from "@/lib/notify";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";

/** Email a fresh verification code to the signed-in (unverified) account. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  const rl = await rateLimit(db, { key: `resend:${user.id}`, ...LIMITS.resendCode });
  if (!rl.ok) return fail("We've sent a few codes already. Please check your inbox (and spam) or try later.", 429);

  const code = await issueVerificationCode(db, user.id);
  const sent = await sendAccountEmail(
    user.email,
    `Your ${site.name} code: ${code}`,
    AuthVerifyEmail({ code, minutes: VERIFY_CODE_MINUTES }),
  );
  if (!sent) return fail("We couldn't send the email. Please try again in a minute.", 502);
  return NextResponse.json({ ok: true });
}
