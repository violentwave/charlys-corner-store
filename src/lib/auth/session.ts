import "server-only";

import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { schema, type Db } from "../db";
import { randomToken, sha256 } from "./tokens";

export const SESSION_COOKIE = "ccs_session";
/**
 * Members stay signed in (Logan, 2026-11-26): a session lasts SESSION_DAYS and is pushed
 * forward whenever it's used (at most once a day), so it only ends when the member signs
 * out, changes or resets their password (every session is revoked), deletes the account, or
 * stays away for a whole year. 2FA is asked at sign-in only, so it comes back exactly then.
 */
export const SESSION_DAYS = 365;
/** Renew when the session is at least this old since its last renewal. */
const RENEW_AFTER_DAYS = 1;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  leadId: string | null;
};

const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});

/** Creates a session row and returns the raw token (only its hash is stored). */
export async function createSession(db: Db, userId: string, now = new Date()) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ userId, tokenHash: sha256(token), expiresAt });
  // Housekeeping: drop this user's expired sessions.
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, now)));
  return { token, expiresAt };
}

export async function userForSessionToken(db: Db, token: string | undefined): Promise<SessionUser | null> {
  const found = await sessionForToken(db, token);
  return found?.user ?? null;
}

async function sessionForToken(db: Db, token: string | undefined) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({
      sessionId: schema.sessions.id,
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      leadId: schema.users.leadId,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    // The database's clock, not new Date(): keeps prerendering deterministic (cacheComponents).
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, sql`now()`)));
  if (!row) return null;
  const { sessionId, ...user } = row;
  return { sessionId, user };
}

/**
 * Sliding expiry: pushes the session SESSION_DAYS ahead when it was last renewed more than
 * RENEW_AFTER_DAYS ago (SQL clock, like the lookup). Returns the new expiry, or null when
 * nothing changed.
 */
export async function renewSession(db: Db, sessionId: string): Promise<Date | null> {
  const [renewed] = await db
    .update(schema.sessions)
    .set({ expiresAt: sql`now() + make_interval(days => ${SESSION_DAYS})` })
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        lt(schema.sessions.expiresAt, sql`now() + make_interval(days => ${SESSION_DAYS - RENEW_AFTER_DAYS})`),
      ),
    )
    .returning({ expiresAt: schema.sessions.expiresAt });
  return renewed?.expiresAt ?? null;
}

/** Route handlers / server functions only (sets a cookie). */
export async function startSession(db: Db, userId: string) {
  const { token, expiresAt } = await createSession(db, userId);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/** The signed-in user for this request, or null. Works in route handlers and server components. */
export async function currentUser(db: Db): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const found = await sessionForToken(db, token);
  if (!found) return null;
  const renewedUntil = await renewSession(db, found.sessionId);
  if (renewedUntil && token) {
    try {
      store.set(SESSION_COOKIE, token, cookieOptions(renewedUntil));
    } catch {
      // Server components can't set cookies; the next route handler call renews the cookie.
    }
  }
  return found.user;
}

/** Signs out this browser: deletes the session row and the cookie. */
export async function endSession(db: Db) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  store.delete(SESSION_COOKIE);
}

/** Signs the user out everywhere (password reset or change): the next sign-in asks for 2FA again. */
export async function revokeAllSessions(db: Db, userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export type VerifiedUser = SessionUser & { emailVerifiedAt: Date; leadId: string };

/**
 * For routes that need a signed-in account with a verified email (artwork upload, sending
 * mockups and order requests). Returns the user, or the reason it can't proceed.
 */
export async function verifiedUser(
  db: Db,
): Promise<{ ok: true; user: VerifiedUser } | { ok: false; status: 401 | 403; error: string }> {
  const user = await currentUser(db);
  if (!user) return { ok: false, status: 401, error: "Please log in or create an account first." };
  if (!user.emailVerifiedAt || !user.leadId) {
    return { ok: false, status: 403, error: "Please confirm your email with the code we sent you." };
  }
  return { ok: true, user: user as VerifiedUser };
}
