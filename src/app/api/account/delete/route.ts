import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { deleteMemberAccount } from "@/lib/account-data";
import { deleteAccountSchema } from "@/lib/auth-schema";
import { confirmIdentity } from "@/lib/auth/reauth";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { currentUser, endSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";

/**
 * POST /api/account/delete: deletes the signed-in member's account after re-confirming them
 * (password and/or 2FA code) (src/lib/account-data.ts deleteMemberAccount). Signs this browser out.
 */
export async function POST(request: Request) {
  const parsed = await readJson(request, deleteAccountSchema);
  if ("response" in parsed) return parsed.response;
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);

  const limit = await rateLimit(db, { key: `account-delete:${user.id}`, ...LIMITS.accountDelete });
  if (!limit.ok) return fail("Too many attempts — please try again later.", 429);

  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  if (!row) return fail("Please log in first.", 401);
  // Password if the account has one; plus a 2FA code when 2FA is on (src/lib/auth/reauth.ts).
  const confirmed = await confirmIdentity(db, row, parsed.data);
  if (!confirmed.ok) return fail(confirmed.message, 400, { [confirmed.field]: confirmed.message });

  await deleteMemberAccount(db, getStorage(), user.id);
  await endSession(db);
  return NextResponse.json({ ok: true });
}
