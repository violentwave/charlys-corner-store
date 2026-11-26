import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { resetPasswordSchema } from "@/lib/auth-schema";
import { consumeResetToken, markEmailVerified } from "@/lib/auth/email-tokens";
import { hashPassword } from "@/lib/auth/password";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { revokeAllSessions } from "@/lib/auth/session";
import { signInOrChallenge } from "@/lib/auth/two-factor";
import { getDb, schema } from "@/lib/db";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * Set a new password from an emailed reset link. Signs out every other session, marks the
 * email verified (the link proved it), and signs this browser in, or asks for the 2FA code
 * first when 2FA is on.
 */
export async function POST(request: Request) {
  const read = await readJson(request, resetPasswordSchema);
  if ("response" in read) return read.response;

  const db = getDb();
  const ip = clientIp(await headers());
  const rl = await rateLimit(db, { key: `reset:${ip}`, ...LIMITS.resetPassword });
  if (!rl.ok) return fail("Too many attempts. Please try again later.", 429);

  const passwordHash = await hashPassword(read.data.password);
  const userId = await consumeResetToken(db, read.data.token);
  if (!userId) return fail("This reset link has expired or was already used. Request a new one.", 400);

  try {
    await db.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, userId));
    await revokeAllSessions(db, userId);
    await markEmailVerified(db, userId);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    // A reset link proves the email, not the second factor: 2FA still applies.
    const outcome = await signInOrChallenge(db, user!);
    if (!outcome.signedIn) return NextResponse.json({ ok: true, twoFactor: outcome.twoFactor });
  } catch {
    return fail("Something went wrong on our end. Please try again.", 500);
  }
  return NextResponse.json({ ok: true });
}
