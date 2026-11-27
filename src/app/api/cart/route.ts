import { count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { currentUser, verifiedUser } from "@/lib/auth/session";
import { listCart, MAX_CART_ITEMS, toView } from "@/lib/cart";
import { getDb, schema } from "@/lib/db";
import { clip } from "@/lib/http";
import { upsertLead } from "@/lib/leads";
import type { MockupArtworkRecord } from "@/lib/mockup-schema";
import { parseMockupUpload } from "@/lib/mockup-upload";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { buildObjectKey, getStorage } from "@/lib/storage";

/** GET /api/cart: the signed-in member's cart (oldest first) with 1-hour preview links. */
export async function GET() {
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  const items = await listCart(db, getStorage(), user.id);
  return NextResponse.json(
    { ok: true, items, max: MAX_CART_ITEMS, pieces: items.reduce((n, i) => n + i.pieces, 0) },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * POST /api/cart: add the builder's design (same multipart upload as POST /api/mockups; the
 * payload's `intent` ("email" or "order") is ignored, sizes may be empty and are filled in on the cart).
 * Verified members only; files go to mockups/cart/.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return fail(auth.error, auth.status);
  const user = auth.user;

  const upload = await parseMockupUpload(request);
  if (!upload.ok) return upload.response;
  const { data, artworks, renders } = upload;

  const ipLimit = await rateLimit(db, { key: `mockup:${clientIp(await headers())}`, ...LIMITS.mockup });
  const userLimit = await rateLimit(db, { key: `cart:${user.id}`, ...LIMITS.cart });
  if (!ipLimit.ok || !userLimit.ok) return fail("Too many changes — please try again in a bit.", 429);

  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.cartItems)
    .where(eq(schema.cartItems.userId, user.id));
  if (n >= MAX_CART_ITEMS) {
    return fail(`Your cart holds up to ${MAX_CART_ITEMS} designs. Send it, or remove one first.`, 409);
  }

  const storage = getStorage();
  const stored: string[] = [];
  const cleanup = () => Promise.all(stored.map((k) => storage.delete(k).catch(() => undefined)));
  const artworkRecords: MockupArtworkRecord[] = [];
  const keysByView = new Map<string, string>();
  try {
    for (const art of artworks) {
      const key = buildObjectKey("mockups/cart", art.file.name);
      await storage.put(key, art.bytes, art.contentType);
      stored.push(key);
      artworkRecords.push({
        key,
        name: clip(art.file.name, 120),
        contentType: art.contentType,
        size: art.bytes.byteLength,
      });
    }
    for (const render of renders) {
      const key = buildObjectKey("mockups/cart", `mockup-${render.view}.png`);
      await storage.put(key, render.bytes, "image/png");
      stored.push(key);
      keysByView.set(render.view, key);
    }
  } catch {
    await cleanup();
    return fail("We couldn't store your files. Please try again or email us.", 502);
  }

  try {
    // The builder's "how did you hear about us" / opt-in answers go on the lead, like /api/mockups.
    await upsertLead(db, {
      email: user.email,
      name: user.name,
      referralSource: data.referralSource ?? null,
      referralOther: data.referralOther || null,
      marketingOptIn: data.marketingOptIn,
    });
    const [row] = await db
      .insert(schema.cartItems)
      .values({
        userId: user.id,
        garment: data.garment,
        colors: data.colors,
        views: data.views.map((entry) => ({ ...entry, mockupKey: keysByView.get(entry.view)! })),
        artworks: artworkRecords,
        sizes: Object.fromEntries(Object.entries(data.sizes).filter(([, q]) => q > 0)),
        notes: data.notes || null,
      })
      .returning();
    return NextResponse.json({ ok: true, item: await toView(row!, storage), count: n + 1 });
  } catch {
    await cleanup();
    console.error("cart insert failed");
    return fail("Something went wrong on our end. Please try again or email us.", 500);
  }
}
