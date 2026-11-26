import { asc, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { fail, readJson } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { MAX_SIZE_SETS, sizeSetSchema } from "@/lib/member-schemas";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { toSizeSet } from "@/lib/size-sets";

/** GET /api/account/size-sets: saved size breakdowns / team rosters. */
export async function GET() {
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  const rows = await db
    .select()
    .from(schema.sizeSets)
    .where(eq(schema.sizeSets.userId, user.id))
    .orderBy(asc(schema.sizeSets.name));
  return NextResponse.json(
    { ok: true, sizeSets: rows.map(toSizeSet), max: MAX_SIZE_SETS },
    { headers: { "cache-control": "no-store" } },
  );
}

/** POST /api/account/size-sets { name, sizes, roster }: save a new one. */
export async function POST(request: Request) {
  const read = await readJson(request, sizeSetSchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  const rl = await rateLimit(db, { key: `size-sets:${user.id}`, ...LIMITS.sizeSets });
  if (!rl.ok) return fail("Too many changes. Please try again in a bit.", 429);
  const [{ n }] = (await db
    .select({ n: count() })
    .from(schema.sizeSets)
    .where(eq(schema.sizeSets.userId, user.id))) as [{ n: number }];
  if (n >= MAX_SIZE_SETS) return fail(`You can keep ${MAX_SIZE_SETS} saved size sets. Delete one first.`, 409);
  const [row] = await db
    .insert(schema.sizeSets)
    .values({ userId: user.id, ...read.data })
    .returning();
  return NextResponse.json({ ok: true, sizeSet: toSizeSet(row!) });
}
