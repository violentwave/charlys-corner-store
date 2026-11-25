import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { AuthVerifyEmail } from "@/emails/auth-verify";
import { signupSchema, type AccountUser } from "@/lib/auth-schema";
import { issueVerificationCode, VERIFY_CODE_MINUTES } from "@/lib/auth/email-tokens";
import { hashPassword } from "@/lib/auth/password";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { startSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { sendAccountEmail } from "@/lib/notify";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";
import { verifyTurnstile } from "@/lib/turnstile";

/**
 * Create an account, sign it in, and email a 6-digit code. The account can't upload artwork
 * or send mockups/orders until the code is entered (POST /api/auth/verify).
 * An existing *unverified* account with this email is taken over (its owner never proved the
 * address); an existing verified one gets a "log in instead" error.
 */
export async function POST(request: Request) {
  const read = await readJson(request, signupSchema);
  if ("response" in read) return read.response;
  const { email: rawEmail, password, name } = read.data;
  const email = rawEmail.trim().toLowerCase();

  const ip = clientIp(await headers());
  const token = await verifyTurnstile(read.data.turnstileToken ?? null, ip);
  if (!token.ok) return fail(token.error, 400);

  const db = getDb();
  const rl = await rateLimit(db, { key: `signup:${ip}`, ...LIMITS.signup });
  if (!rl.ok) return fail("Too many sign-ups from here. Please try again later.", 429);

  const passwordHash = await hashPassword(password);
  let userId: string;
  try {
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (existing?.emailVerifiedAt) {
      return fail("An account with this email already exists. Log in instead.", 409, {
        email: "An account with this email already exists. Log in instead.",
      });
    }
    if (existing) {
      await db
        .update(schema.users)
        .set({ passwordHash, name: name || null, updatedAt: new Date() })
        .where(eq(schema.users.id, existing.id));
      userId = existing.id;
    } else {
      const [row] = await db
        .insert(schema.users)
        .values({ email, passwordHash, name: name || null })
        .onConflictDoNothing()
        .returning({ id: schema.users.id });
      if (!row) return fail("An account with this email already exists. Log in instead.", 409);
      userId = row.id;
    }
    const code = await issueVerificationCode(db, userId);
    await sendAccountEmail(
      email,
      `Your ${site.name} code: ${code}`,
      AuthVerifyEmail({ code, minutes: VERIFY_CODE_MINUTES }),
    );
    await startSession(db, userId);
  } catch {
    console.error("signup failed");
    return fail("Something went wrong on our end. Please try again.", 500);
  }

  const user: AccountUser = { email, name: name || null, verified: false };
  return NextResponse.json({ ok: true, user });
}
