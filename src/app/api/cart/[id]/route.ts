import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/origin";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { badSize, cartFileKeys, cartItemUpdateSchema, cartRestore, toView } from "@/lib/cart";
import { getDb, schema } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The member's own cart item, or null (someone else's id looks the same as a missing one). */
async function own(id: string) {
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return { db, user: null, row: null };
  if (!UUID.test(id)) return { db, user, row: null };
  const [row] = await db
    .select()
    .from(schema.cartItems)
    .where(and(eq(schema.cartItems.id, id), eq(schema.cartItems.userId, user.id)));
  return { db, user, row: row ?? null };
}

/** GET /api/cart/[id]: the design, to reopen in the builder (same shape as GET /api/mockups/[id]). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, row } = await own((await params).id);
  if (!user) return fail("Please log in first.", 401);
  if (!row) return fail("We couldn't find that item.", 404);
  try {
    return NextResponse.json({ ok: true, ...(await cartRestore(row, getStorage())) });
  } catch {
    return fail("We couldn't load that design.", 502);
  }
}

/** PATCH /api/cart/[id] { sizes?, notes? }: sizes replace the item's sizes (0s dropped). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const read = await readJson(request, cartItemUpdateSchema);
  if ("response" in read) return read.response;
  const { db, user, row } = await own((await params).id);
  if (!user) return fail("Please log in first.", 401);
  if (!row) return fail("We couldn't find that item.", 404);
  const rl = await rateLimit(db, { key: `cart:${user.id}`, ...LIMITS.cart });
  if (!rl.ok) return fail("Too many changes — please try again in a bit.", 429);

  const sizes = read.data.sizes
    ? Object.fromEntries(Object.entries(read.data.sizes).filter(([, q]) => q > 0))
    : undefined;
  if (sizes) {
    const bad = badSize(row.garment, sizes);
    if (bad) return fail(`That garment doesn't come in ${bad}.`, 400, { sizes: "Pick from the sizes listed" });
  }
  const [updated] = await db
    .update(schema.cartItems)
    .set({
      ...(sizes ? { sizes } : {}),
      ...(read.data.notes !== undefined ? { notes: read.data.notes || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.cartItems.id, row.id))
    .returning();
  return NextResponse.json({ ok: true, item: await toView(updated!, getStorage()) });
}

/** DELETE /api/cart/[id]: removes the item and its files. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const { db, user, row } = await own((await params).id);
  if (!user) return fail("Please log in first.", 401);
  if (!row) return fail("We couldn't find that item.", 404);
  const rl = await rateLimit(db, { key: `cart:${user.id}`, ...LIMITS.cart });
  if (!rl.ok) return fail("Too many changes — please try again in a bit.", 429);
  await db.delete(schema.cartItems).where(eq(schema.cartItems.id, row.id));
  const storage = getStorage();
  await Promise.all(cartFileKeys(row).map((k) => storage.delete(k).catch(() => undefined)));
  return NextResponse.json({ ok: true });
}
