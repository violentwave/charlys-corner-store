import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { schema, type Db } from "../db";
import { upsertLead } from "../leads";
import { codeHash, randomToken, sha256, verificationCode } from "./tokens";

export const VERIFY_CODE_MINUTES = 15;
export const VERIFY_MAX_ATTEMPTS = 5;
export const RESET_TOKEN_MINUTES = 60;

const minutes = (n: number, from = new Date()) => new Date(from.getTime() + n * 60 * 1000);

async function retireTokens(db: Db, userId: string, purpose: "verify_email" | "reset_password") {
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

/** New 6-digit code (any earlier unused code stops working). Returns the code to email. */
export async function issueVerificationCode(db: Db, userId: string): Promise<string> {
  await retireTokens(db, userId, "verify_email");
  const code = verificationCode();
  await db.insert(schema.authTokens).values({
    userId,
    purpose: "verify_email",
    tokenHash: codeHash(userId, code),
    expiresAt: minutes(VERIFY_CODE_MINUTES),
  });
  return code;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

/**
 * Checks a code against the user's latest unused one. Every wrong guess counts; after
 * VERIFY_MAX_ATTEMPTS the code is dead and a new one must be sent. On success the email is
 * marked verified and linked to its lead (coupons hang off leads).
 */
export async function checkVerificationCode(db: Db, userId: string, code: string): Promise<VerifyResult> {
  const [token] = await db
    .select()
    .from(schema.authTokens)
    .where(
      and(
        eq(schema.authTokens.userId, userId),
        eq(schema.authTokens.purpose, "verify_email"),
        isNull(schema.authTokens.usedAt),
      ),
    )
    .orderBy(sql`${schema.authTokens.createdAt} desc`)
    .limit(1);
  if (!token) return { ok: false, reason: "expired" };
  if (token.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  if (token.attempts >= VERIFY_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  if (token.tokenHash !== codeHash(userId, code)) {
    const [after] = await db
      .update(schema.authTokens)
      .set({ attempts: sql`${schema.authTokens.attempts} + 1` })
      .where(eq(schema.authTokens.id, token.id))
      .returning({ attempts: schema.authTokens.attempts });
    return { ok: false, reason: (after?.attempts ?? 0) >= VERIFY_MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
  }

  // Single use: only the request that flips used_at wins.
  const [used] = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.id, token.id), isNull(schema.authTokens.usedAt)))
    .returning({ id: schema.authTokens.id });
  if (!used) return { ok: false, reason: "expired" };
  await markEmailVerified(db, userId);
  return { ok: true };
}

export async function markEmailVerified(db: Db, userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return;
  const leadId = user.leadId ?? (await upsertLead(db, { email: user.email, name: user.name }));
  await db
    .update(schema.users)
    .set({ emailVerifiedAt: user.emailVerifiedAt ?? new Date(), leadId, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

/** New password-reset token (earlier ones stop working). Returns the raw token for the email link. */
export async function issueResetToken(db: Db, userId: string): Promise<string> {
  await retireTokens(db, userId, "reset_password");
  const token = randomToken();
  await db.insert(schema.authTokens).values({
    userId,
    purpose: "reset_password",
    tokenHash: sha256(token),
    expiresAt: minutes(RESET_TOKEN_MINUTES),
  });
  return token;
}

/** Consumes a reset token (single use). Returns the user id, or null if invalid/expired/used. */
export async function consumeResetToken(db: Db, token: string): Promise<string | null> {
  const [row] = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.authTokens.tokenHash, sha256(token)),
        eq(schema.authTokens.purpose, "reset_password"),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: schema.authTokens.userId });
  return row?.userId ?? null;
}
