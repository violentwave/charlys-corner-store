import { NextResponse } from "next/server";

import { verifyCodeSchema } from "@/lib/auth-schema";
import { checkVerificationCode } from "@/lib/auth/email-tokens";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

const MESSAGES = {
  invalid: "That code isn't right. Check the email and try again.",
  expired: "That code has expired. Send a new one.",
  too_many_attempts: "Too many wrong tries. Send a new code.",
} as const;

/** Confirm the signed-in account's email with the 6-digit code. */
export async function POST(request: Request) {
  const read = await readJson(request, verifyCodeSchema);
  if ("response" in read) return read.response;

  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true });

  const rl = await rateLimit(db, { key: `verify:${user.id}`, ...LIMITS.verifyCode });
  if (!rl.ok) return fail("Too many tries. Please wait a bit and send a new code.", 429);

  const result = await checkVerificationCode(db, user.id, read.data.code);
  if (!result.ok) return fail(MESSAGES[result.reason], 400, { code: MESSAGES[result.reason] });
  return NextResponse.json({ ok: true });
}
