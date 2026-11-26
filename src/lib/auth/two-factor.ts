import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { AuthTwoFactorEmail } from "@/emails/auth-two-factor";

import { schema, type Db } from "../db";
import { sendAccountEmail } from "../notify";
import { site } from "../site";
import { hashRecoveryCode, looksLikeRecoveryCode } from "./recovery-codes";
import { openSecret } from "./secret-box";
import { startSession } from "./session";
import { codeHash, randomToken, sha256, verificationCode } from "./tokens";
import { verifyTotp } from "./totp";

/**
 * Two-factor sign-in (Logan, 2026-11-26): an authenticator app (TOTP) or, as a fallback, a
 * 6-digit code by email; plus one-time backup codes. When a member with 2FA on proves the
 * first factor (password, Google, or a password-reset link), no session is created yet:
 * a short-lived "challenge" (hashed token in auth_tokens, raw token in the httpOnly
 * `ccs_2fa` cookie) waits for the second factor at POST /api/auth/2fa/verify.
 */
export const CHALLENGE_COOKIE = "ccs_2fa";
export const CHALLENGE_MINUTES = 10;
export const TWO_FACTOR_EMAIL_MINUTES = 10;
export const TWO_FACTOR_MAX_ATTEMPTS = 5;

export type TwoFactorMethod = "totp" | "email";
type UserRow = typeof schema.users.$inferSelect;

const minutesFromNow = (n: number) => new Date(Date.now() + n * 60 * 1000);

async function retire(db: Db, userId: string, purpose: "two_factor_challenge" | "two_factor_email") {
  await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.authTokens.userId, userId),
        eq(schema.authTokens.purpose, purpose),
        isNull(schema.authTokens.usedAt),
      ),
    );
}

/** Emails a fresh 6-digit 2FA code (earlier ones stop working). Returns whether it sent. */
export async function sendTwoFactorEmailCode(
  db: Db,
  user: Pick<UserRow, "id" | "email">,
  purpose: "sign-in" | "setup",
) {
  await retire(db, user.id, "two_factor_email");
  const code = verificationCode();
  await db.insert(schema.authTokens).values({
    userId: user.id,
    purpose: "two_factor_email",
    tokenHash: codeHash(user.id, code),
    expiresAt: minutesFromNow(TWO_FACTOR_EMAIL_MINUTES),
  });
  return sendAccountEmail(
    user.email,
    `Your ${site.name} sign-in code: ${code}`,
    AuthTwoFactorEmail({ code, minutes: TWO_FACTOR_EMAIL_MINUTES, purpose }),
  );
}

/** Consumes the latest emailed 2FA code if it matches (single use; counts wrong tries). */
async function consumeEmailCode(db: Db, userId: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const [token] = await db
    .select()
    .from(schema.authTokens)
    .where(
      and(
        eq(schema.authTokens.userId, userId),
        eq(schema.authTokens.purpose, "two_factor_email"),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
      ),
    )
    .orderBy(sql`${schema.authTokens.createdAt} desc`)
    .limit(1);
  if (!token || token.attempts >= TWO_FACTOR_MAX_ATTEMPTS) return false;
  if (token.tokenHash !== codeHash(userId, code)) {
    await db
      .update(schema.authTokens)
      .set({ attempts: sql`${schema.authTokens.attempts} + 1` })
      .where(eq(schema.authTokens.id, token.id));
    return false;
  }
  const [used] = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.id, token.id), isNull(schema.authTokens.usedAt)))
    .returning({ id: schema.authTokens.id });
  return !!used;
}

export type SecondFactorResult = { ok: true; via: "totp" | "email" | "recovery" } | { ok: false };

/**
 * Checks a second factor for `user`: the authenticator code (or the emailed code, for email
 * 2FA), or one of their backup codes. A used backup code is removed; a used TOTP step can't
 * be replayed. Also used to re-confirm the member before turning 2FA off.
 */
export async function checkSecondFactor(db: Db, user: UserRow, rawCode: string): Promise<SecondFactorResult> {
  const code = rawCode.trim();
  if (user.twoFactorMethod === "totp" && user.totpSecret && /^\d{6}$/.test(code)) {
    const step = verifyTotp(openSecret(user.totpSecret), code, user.totpLastStep);
    if (step !== null) {
      // Conditional update: two requests racing with the same code can't both win.
      const [won] = await db
        .update(schema.users)
        .set({ totpLastStep: step })
        .where(
          and(
            eq(schema.users.id, user.id),
            sql`(${schema.users.totpLastStep} is null or ${schema.users.totpLastStep} < ${step})`,
          ),
        )
        .returning({ id: schema.users.id });
      if (won) return { ok: true, via: "totp" };
    }
    return { ok: false };
  }
  if (user.twoFactorMethod === "email" && /^\d{6}$/.test(code)) {
    return (await consumeEmailCode(db, user.id, code)) ? { ok: true, via: "email" } : { ok: false };
  }
  if (looksLikeRecoveryCode(code)) {
    const hash = hashRecoveryCode(user.id, code);
    if (!user.recoveryCodeHashes.includes(hash)) return { ok: false };
    // Remove it atomically (jsonb array minus the element): each code works once.
    const [won] = await db
      .update(schema.users)
      .set({ recoveryCodeHashes: sql`${schema.users.recoveryCodeHashes} - ${hash}::text` })
      .where(and(eq(schema.users.id, user.id), sql`${schema.users.recoveryCodeHashes} ? ${hash}::text`))
      .returning({ id: schema.users.id });
    return won ? { ok: true, via: "recovery" } : { ok: false };
  }
  return { ok: false };
}

/**
 * First factor done for a member with 2FA on: starts the challenge (cookie + row) instead of
 * a session, and emails a code for email 2FA. Returns what the sign-in screen should ask for.
 */
export async function beginTwoFactorChallenge(
  db: Db,
  user: UserRow,
): Promise<{ method: TwoFactorMethod; emailSent: boolean }> {
  const method = user.twoFactorMethod!;
  await retire(db, user.id, "two_factor_challenge");
  const token = randomToken();
  const expiresAt = minutesFromNow(CHALLENGE_MINUTES);
  await db
    .insert(schema.authTokens)
    .values({ userId: user.id, purpose: "two_factor_challenge", tokenHash: sha256(token), expiresAt });
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  const emailSent = method === "email" ? await sendTwoFactorEmailCode(db, user, "sign-in") : false;
  return { method, emailSent };
}

/** The member behind this browser's pending challenge (unused, unexpired, attempts left). */
export async function pendingChallenge(db: Db) {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ challenge: schema.authTokens, user: schema.users })
    .from(schema.authTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.authTokens.userId))
    .where(
      and(
        eq(schema.authTokens.tokenHash, sha256(token)),
        eq(schema.authTokens.purpose, "two_factor_challenge"),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
      ),
    );
  if (!row || row.challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) return null;
  return row;
}

export type CompleteResult =
  | { ok: true; user: UserRow; via: "totp" | "email" | "recovery" }
  | { ok: false; reason: "no_challenge" | "invalid" | "too_many_attempts" };

/** Second step of sign-in: checks the code against the pending challenge and starts the session. */
export async function completeTwoFactorChallenge(db: Db, code: string): Promise<CompleteResult> {
  const pending = await pendingChallenge(db);
  if (!pending) return { ok: false, reason: "no_challenge" };
  const result = await checkSecondFactor(db, pending.user, code);
  if (!result.ok) {
    const [after] = await db
      .update(schema.authTokens)
      .set({ attempts: sql`${schema.authTokens.attempts} + 1` })
      .where(eq(schema.authTokens.id, pending.challenge.id))
      .returning({ attempts: schema.authTokens.attempts });
    return { ok: false, reason: (after?.attempts ?? 0) >= TWO_FACTOR_MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
  }
  const [used] = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.id, pending.challenge.id), isNull(schema.authTokens.usedAt)))
    .returning({ id: schema.authTokens.id });
  if (!used) return { ok: false, reason: "no_challenge" };
  (await cookies()).delete(CHALLENGE_COOKIE);
  await startSession(db, pending.user.id);
  return { ok: true, user: pending.user, via: result.via };
}

/**
 * The finish line of every first factor (password, Google, reset link): straight into a
 * session when 2FA is off, otherwise the challenge.
 */
export async function signInOrChallenge(
  db: Db,
  user: UserRow,
): Promise<{ signedIn: true } | { signedIn: false; twoFactor: { method: TwoFactorMethod; emailSent: boolean } }> {
  if (!user.twoFactorMethod) {
    await startSession(db, user.id);
    return { signedIn: true };
  }
  return { signedIn: false, twoFactor: await beginTwoFactorChallenge(db, user) };
}
