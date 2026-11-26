import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { deleteMemberAccount } from "@/lib/account-data";
import { deleteAccountSchema } from "@/lib/auth-schema";
import { verifyPassword } from "@/lib/auth/password";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { currentUser, endSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";

/**
 * POST /api/account/delete: deletes the signed-in member's account after re-checking the
 * password (src/lib/account-data.ts deleteMemberAccount). Signs this browser out.
 */
export async function POST(request: Request) {
  const parsed = await readJson(request, deleteAccountSchema);
  if ("response" in parsed) return parsed.response;
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);

  const limit = await rateLimit(db, { key: `account-delete:${user.id}`, ...LIMITS.accountDelete });
  if (!limit.ok) return fail("Too many attempts — please try again later.", 429);

  const [row] = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  if (!row || !(await verifyPassword(parsed.data.password, row.passwordHash))) {
    return fail("That password isn't right.", 400, { password: "That password isn't right." });
  }

  await deleteMemberAccount(db, getStorage(), user.id);
  await endSession(db);
  return NextResponse.json({ ok: true });
}
