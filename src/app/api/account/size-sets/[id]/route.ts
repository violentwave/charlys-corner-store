import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/origin";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { sizeSetSchema } from "@/lib/member-schemas";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { toSizeSet } from "@/lib/size-sets";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** PUT /api/account/size-sets/[id]: replace a saved size set. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const read = await readJson(request, sizeSetSchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("We couldn't find that size set.", 404);
  const rl = await rateLimit(db, { key: `size-sets:${user.id}`, ...LIMITS.sizeSets });
  if (!rl.ok) return fail("Too many changes. Please try again in a bit.", 429);
  const [row] = await db
    .update(schema.sizeSets)
    .set({ ...read.data, updatedAt: new Date() })
    .where(and(eq(schema.sizeSets.id, id), eq(schema.sizeSets.userId, user.id)))
    .returning();
  if (!row) return fail("We couldn't find that size set.", 404);
  return NextResponse.json({ ok: true, sizeSet: toSizeSet(row) });
}

/** DELETE /api/account/size-sets/[id] */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("We couldn't find that size set.", 404);
  const [row] = await db
    .delete(schema.sizeSets)
    .where(and(eq(schema.sizeSets.id, id), eq(schema.sizeSets.userId, user.id)))
    .returning({ id: schema.sizeSets.id });
  if (!row) return fail("We couldn't find that size set.", 404);
  return NextResponse.json({ ok: true });
}
