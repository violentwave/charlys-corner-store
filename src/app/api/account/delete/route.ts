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

  // Best-effort: disable any saved Square cards before the account goes (P51-4).
  if (row.squareCustomerId && process.env.SQUARE_ACCESS_TOKEN) {
    try {
      const { squareBaseUrl } = await import("@/lib/square");
      const r = await fetch(`${squareBaseUrl()}/v2/cards?customer_id=${encodeURIComponent(row.squareCustomerId)}`, {
        headers: {
          Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          "Square-Version": "2024-10-17",
          "Content-Type": "application/json",
        },
      });
      const json = (await r.json().catch(() => null)) as { cards?: { id: string; enabled: boolean }[] } | null;
      for (const c of (json?.cards ?? []).filter((x) => x.enabled !== false)) {
        await fetch(`${squareBaseUrl()}/v2/cards/${encodeURIComponent(c.id)}/disable`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
            "Square-Version": "2024-10-17",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }).catch(() => undefined);
      }
    } catch {
      // best-effort; never block deletion
    }
  }

  await deleteMemberAccount(db, getStorage(), user.id);
  await endSession(db);
  return NextResponse.json({ ok: true });
}
