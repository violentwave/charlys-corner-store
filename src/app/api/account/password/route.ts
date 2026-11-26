import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentMemberRow } from "@/lib/auth/member";
import { hashPassword } from "@/lib/auth/password";
import { confirmIdentity } from "@/lib/auth/reauth";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { endSession, revokeAllSessions } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { changePasswordSchema } from "@/lib/member-schemas";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/account/password: change (or, for a Google-only account, set) the password.
 * Re-confirms with the current password and a 2FA code when those exist. Then every session
 * ends, this one included: the member signs in again, with 2FA (Logan, 2026-11-26).
 */
export async function POST(request: Request) {
  const read = await readJson(request, changePasswordSchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const user = await currentMemberRow(db);
  if (!user) return fail("Please log in first.", 401);
  const rl = await rateLimit(db, { key: `security:${user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return fail("Too many tries. Please try again later.", 429);

  const confirmed = await confirmIdentity(db, user, { password: read.data.currentPassword, code: read.data.code });
  if (!confirmed.ok) {
    const field = confirmed.field === "password" ? "currentPassword" : "code";
    return fail(confirmed.message, 400, { [field]: confirmed.message });
  }
  const passwordHash = await hashPassword(read.data.newPassword);
  await db.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
  await revokeAllSessions(db, user.id);
  await endSession(db);
  return NextResponse.json({ ok: true, signedOut: true });
}
