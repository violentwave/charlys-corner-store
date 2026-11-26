import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { fail } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

export type WalletCoupon = {
  code: string;
  percentOff: number;
  minOrderCents: number;
  /** issued = waiting for the first order; eligible = usable now; redeemed / expired. */
  status: "issued" | "eligible" | "redeemed" | "expired";
  issuedAt: string;
  expiresAt: string;
};

/** GET /api/account/wallet: the member's 15%-off-2nd-order coupon (one per email), if any. */
export async function GET() {
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  if (!user.leadId) return NextResponse.json({ ok: true, coupon: null }, { headers: { "cache-control": "no-store" } });
  const [row] = await db.select().from(schema.coupons).where(eq(schema.coupons.leadId, user.leadId));
  const coupon: WalletCoupon | null = row
    ? {
        code: row.code,
        percentOff: row.percentOff,
        minOrderCents: row.minOrderCents,
        // Past its date: shown as expired even before any cleanup job flips the status.
        status: row.status !== "redeemed" && row.expiresAt.getTime() < Date.now() ? "expired" : row.status,
        issuedAt: row.issuedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      }
    : null;
  return NextResponse.json({ ok: true, coupon }, { headers: { "cache-control": "no-store" } });
}
