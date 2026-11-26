import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { removeMemberDesign } from "@/lib/account-data";
import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/account/mockups/[id]: the member removes one of their designs ("My designs").
 * Emailed mockups are deleted with their files; order requests are hidden from the list only
 * (src/lib/account-data.ts). Another member's id answers 404.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("We couldn't find that design.", 404);

  void clientIp(await headers()); // rate limits key on the account here, not the IP
  const limit = await rateLimit(db, { key: `account-design-delete:${user.id}`, ...LIMITS.accountDesignDelete });
  if (!limit.ok) return fail("Too many deletes at once — please try again in a bit.", 429);

  const result = await removeMemberDesign(db, getStorage(), user.id, id);
  if (result === "not_found") return fail("We couldn't find that design.", 404);
  return NextResponse.json({ ok: true, result });
}
