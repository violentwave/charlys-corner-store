import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { verifyCodeSchema } from "@/lib/auth-schema";
import { issueBackupCodes } from "@/lib/auth/backup-codes";
import { currentMemberRow } from "@/lib/auth/member";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { openSecret } from "@/lib/auth/secret-box";
import { verifyTotp } from "@/lib/auth/totp";
import { getDb, schema } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/** Step 2: the first code from the app proves it's set up; 2FA turns on and backup codes are issued. */
export async function POST(request: Request) {
  const read = await readJson(request, verifyCodeSchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const user = await currentMemberRow(db);
  if (!user) return fail("Please log in first.", 401);
  if (user.twoFactorMethod) return fail("Two-step sign-in is already on.", 409);
  if (!user.totpPendingSecret) return fail("Start the setup again to get a new QR code.", 400);
  const rl = await rateLimit(db, { key: `security:${user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return fail("Too many tries. Please try again later.", 429);

  const step = verifyTotp(openSecret(user.totpPendingSecret), read.data.code, null);
  if (step === null) {
    const message = "That code isn't right. Check the time on your phone and try the newest code.";
    return fail(message, 400, { code: message });
  }
  const [updated] = await db
    .update(schema.users)
    .set({
      twoFactorMethod: "totp",
      totpSecret: user.totpPendingSecret,
      totpPendingSecret: null,
      totpLastStep: step,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.users.id, user.id), isNull(schema.users.twoFactorMethod)))
    .returning({ id: schema.users.id });
  if (!updated) return fail("Two-step sign-in is already on.", 409);
  return NextResponse.json(
    { ok: true, backupCodes: await issueBackupCodes(db, user.id) },
    { headers: { "cache-control": "no-store" } },
  );
}
