import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { confirmIdentitySchema } from "@/lib/auth-schema";
import { currentMemberRow } from "@/lib/auth/member";
import { confirmIdentity } from "@/lib/auth/reauth";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { getDb, schema } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * Disconnects Google. Only when the account has a password (else it couldn't sign in at all;
 * "Forgot password" sets one first). Re-confirms like the other security changes.
 */
export async function POST(request: Request) {
  const read = await readJson(request, confirmIdentitySchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const user = await currentMemberRow(db);
  if (!user) return fail("Please log in first.", 401);
  if (!user.googleSub) return NextResponse.json({ ok: true });
  if (!user.passwordHash) {
    return fail("Set a password first (Forgot password), so you can still sign in without Google.", 400);
  }
  const rl = await rateLimit(db, { key: `security:${user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return fail("Too many tries. Please try again later.", 429);

  const confirmed = await confirmIdentity(db, user, read.data);
  if (!confirmed.ok) return fail(confirmed.message, 400, { [confirmed.field]: confirmed.message });
  await db.update(schema.users).set({ googleSub: null, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
  return NextResponse.json({ ok: true });
}
