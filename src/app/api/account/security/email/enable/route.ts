import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { verifyCodeSchema } from "@/lib/auth-schema";
import { issueBackupCodes } from "@/lib/auth/backup-codes";
import { currentMemberRow } from "@/lib/auth/member";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { checkSecondFactor } from "@/lib/auth/two-factor";
import { getDb, schema } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/** Turns on email 2FA with the code from /email/setup; issues backup codes. */
export async function POST(request: Request) {
  const read = await readJson(request, verifyCodeSchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const user = await currentMemberRow(db);
  if (!user) return fail("Please log in first.", 401);
  if (user.twoFactorMethod) return fail("Two-step sign-in is already on.", 409);
  const rl = await rateLimit(db, { key: `security:${user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return fail("Too many tries. Please try again later.", 429);

  // checkSecondFactor only reads emailed codes when the method is email: check as if it were.
  const ok = (await checkSecondFactor(db, { ...user, twoFactorMethod: "email" }, read.data.code)).ok;
  if (!ok) {
    const message = "That code isn't right, or it expired. Send a new one.";
    return fail(message, 400, { code: message });
  }
  const [updated] = await db
    .update(schema.users)
    .set({ twoFactorMethod: "email", totpPendingSecret: null, updatedAt: new Date() })
    .where(and(eq(schema.users.id, user.id), isNull(schema.users.twoFactorMethod)))
    .returning({ id: schema.users.id });
  if (!updated) return fail("Two-step sign-in is already on.", 409);
  return NextResponse.json(
    { ok: true, backupCodes: await issueBackupCodes(db, user.id) },
    { headers: { "cache-control": "no-store" } },
  );
}
