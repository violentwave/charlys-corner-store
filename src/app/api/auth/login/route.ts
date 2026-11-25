import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { loginSchema, type AccountUser } from "@/lib/auth-schema";
import { dummyHash, verifyPassword } from "@/lib/auth/password";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { startSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";

const WRONG = "That email and password don't match.";

/** Log in with email + password. Same error and similar timing for unknown emails and wrong passwords. */
export async function POST(request: Request) {
  const read = await readJson(request, loginSchema);
  if ("response" in read) return read.response;
  const email = read.data.email.trim().toLowerCase();

  const db = getDb();
  const ip = clientIp(await headers());
  const byIp = await rateLimit(db, { key: `login:${ip}`, ...LIMITS.login });
  const byEmail = await rateLimit(db, { key: `login-email:${email}`, ...LIMITS.loginEmail });
  if (!byIp.ok || !byEmail.ok) return fail("Too many attempts. Please wait a few minutes and try again.", 429);

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const ok = await verifyPassword(read.data.password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) return fail(WRONG, 401, { password: WRONG });

  try {
    await startSession(db, user.id);
  } catch {
    return fail("Something went wrong on our end. Please try again.", 500);
  }
  const body: AccountUser = { email: user.email, name: user.name, verified: !!user.emailVerifiedAt };
  return NextResponse.json({ ok: true, user: body });
}
