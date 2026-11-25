import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { AuthResetEmail } from "@/emails/auth-reset";
import { forgotPasswordSchema } from "@/lib/auth-schema";
import { issueResetToken, RESET_TOKEN_MINUTES } from "@/lib/auth/email-tokens";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { getDb, schema } from "@/lib/db";
import { sendAccountEmail } from "@/lib/notify";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";
import { verifyTurnstile } from "@/lib/turnstile";

const DONE = "If that email has an account, a reset link is on its way.";

/** Email a password-reset link. Same answer whether or not the account exists. */
export async function POST(request: Request) {
  const read = await readJson(request, forgotPasswordSchema);
  if ("response" in read) return read.response;
  const email = read.data.email.trim().toLowerCase();

  const ip = clientIp(await headers());
  const token = await verifyTurnstile(read.data.turnstileToken ?? null, ip);
  if (!token.ok) return fail(token.error, 400);

  const db = getDb();
  const byIp = await rateLimit(db, { key: `forgot-ip:${ip}`, ...LIMITS.resetPassword });
  const byEmail = await rateLimit(db, { key: `forgot:${email}`, ...LIMITS.forgotPassword });
  if (!byIp.ok) return fail("Too many requests. Please try again later.", 429);
  if (!byEmail.ok) return NextResponse.json({ ok: true, message: DONE });

  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (user) {
    const reset = await issueResetToken(db, user.id);
    await sendAccountEmail(
      email,
      `Reset your ${site.name} password`,
      AuthResetEmail({ url: `${site.url}/reset-password?token=${reset}`, minutes: RESET_TOKEN_MINUTES }),
    );
  }
  return NextResponse.json({ ok: true, message: DONE });
}
