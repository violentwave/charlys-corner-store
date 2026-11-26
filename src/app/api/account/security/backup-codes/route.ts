import { NextResponse } from "next/server";

import { confirmIdentitySchema } from "@/lib/auth-schema";
import { issueBackupCodes } from "@/lib/auth/backup-codes";
import { currentMemberRow } from "@/lib/auth/member";
import { confirmIdentity } from "@/lib/auth/reauth";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { getDb } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/** New backup codes (the old ones stop working), after re-confirming. */
export async function POST(request: Request) {
  const read = await readJson(request, confirmIdentitySchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const user = await currentMemberRow(db);
  if (!user) return fail("Please log in first.", 401);
  if (!user.twoFactorMethod) return fail("Turn on two-step sign-in first.", 400);
  const rl = await rateLimit(db, { key: `security:${user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return fail("Too many tries. Please try again later.", 429);

  const confirmed = await confirmIdentity(db, user, read.data);
  if (!confirmed.ok) return fail(confirmed.message, 400, { [confirmed.field]: confirmed.message });
  return NextResponse.json(
    { ok: true, backupCodes: await issueBackupCodes(db, user.id) },
    { headers: { "cache-control": "no-store" } },
  );
}
