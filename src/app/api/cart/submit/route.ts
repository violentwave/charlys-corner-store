import { NextResponse } from "next/server";

import { fail, readJson } from "@/lib/auth/route-helpers";
import { verifiedUser } from "@/lib/auth/session";
import { cartSubmitSchema, submitCart } from "@/lib/cart";
import { getDb } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";

/**
 * POST /api/cart/submit { notes? }: sends the whole cart as one order request (owner prices it,
 * the customer pays once at /pay/<orderId>). Shares the per-member order-request limit.
 */
export async function POST(request: Request) {
  const read = await readJson(request, cartSubmitSchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return fail(auth.error, auth.status);
  const rl = await rateLimit(db, { key: `mockup-user:${auth.user.id}`, ...LIMITS.mockupEmail });
  if (!rl.ok) return fail("Too many requests today. Please try again tomorrow or email us.", 429);

  const result = await submitCart(db, getStorage(), auth.user, read.data);
  if (!result.ok) return fail(result.error, result.status, result.fieldErrors);
  return NextResponse.json({ ok: true, orderId: result.orderId, itemCount: result.itemCount });
}
