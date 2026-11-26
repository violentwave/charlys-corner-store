import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { twoFactorVerifySchema, type AccountUser } from "@/lib/auth-schema";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { completeTwoFactorChallenge, pendingChallenge } from "@/lib/auth/two-factor";
import { getDb } from "@/lib/db";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";

const MESSAGES = {
  no_challenge: "Your sign-in timed out. Please sign in again.",
  invalid: "That code isn't right. Try again, or use a backup code.",
  too_many_attempts: "Too many wrong codes. Please sign in again.",
} as const;

/**
 * Second step of sign-in when 2FA is on: the authenticator / emailed code or a backup code
 * for the pending challenge (`ccs_2fa` cookie). Starts the session on success.
 */
export async function POST(request: Request) {
  const read = await readJson(request, twoFactorVerifySchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const ip = clientIp(await headers());
  const rl = await rateLimit(db, { key: `2fa-verify:${ip}`, ...LIMITS.twoFactorVerify });
  if (!rl.ok) return fail("Too many tries. Please wait a few minutes.", 429);

  const result = await completeTwoFactorChallenge(db, read.data.code);
  if (!result.ok) {
    const status = result.reason === "invalid" ? 400 : 401;
    return fail(MESSAGES[result.reason], status, result.reason === "invalid" ? { code: MESSAGES.invalid } : undefined);
  }
  const user: AccountUser = {
    email: result.user.email,
    name: result.user.name,
    verified: !!result.user.emailVerifiedAt,
  };
  return NextResponse.json({
    ok: true,
    user,
    // A backup code was spent: the account page should nudge them to make new ones when low.
    usedBackupCode: result.via === "recovery",
    backupCodesLeft: result.user.recoveryCodeHashes.length - (result.via === "recovery" ? 1 : 0),
  });
}

/** GET: is a sign-in waiting for a code in this browser? (After Google, the page asks.) */
export async function GET() {
  const pending = await pendingChallenge(getDb());
  return NextResponse.json(
    { pending: pending ? { method: pending.user.twoFactorMethod } : null },
    { headers: { "cache-control": "no-store" } },
  );
}
