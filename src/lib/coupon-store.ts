import "server-only";

import { sql } from "drizzle-orm";

import { COUPON_RULES, couponExpiry, generateCouponCode, type CouponStatus } from "./coupons";
import type { Db } from "./db";

export type IssuedCoupon = {
  id: string;
  code: string;
  status: CouponStatus;
  issuedAt: Date;
  expiresAt: Date;
  /** false when this email already had a coupon (resubmits re-send the same code). */
  isNew: boolean;
};

type Row = { id: string; code: string; status: CouponStatus; issued_at: Date | string; expires_at: Date | string };
const toCoupon = (r: Row, isNew: boolean): IssuedCoupon => ({
  id: r.id,
  code: r.code,
  status: r.status,
  issuedAt: new Date(r.issued_at),
  expiresAt: new Date(r.expires_at),
  isNew,
});

/**
 * Issue the lead's "15% off your 2nd order" coupon, or return the one it already has.
 * Idempotent and race-safe: the unique lead_id index decides, and a (very unlikely) code
 * collision just retries with a fresh code. Server-only: coupons are never issued client-side.
 */
export async function issueCoupon(db: Db, leadId: string, now = new Date()): Promise<IssuedCoupon> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows: inserted } = await db.execute<Row>(sql`
      insert into coupons (lead_id, code, percent_off, min_order_cents, issued_at, expires_at)
      values (${leadId}, ${generateCouponCode()}, ${COUPON_RULES.percentOff}, ${COUPON_RULES.minOrderCents},
              ${now.toISOString()}, ${couponExpiry(now).toISOString()})
      on conflict do nothing
      returning id, code, status, issued_at, expires_at
    `);
    if (inserted[0]) return toCoupon(inserted[0], true);

    const { rows: existing } = await db.execute<Row>(sql`
      select id, code, status, issued_at, expires_at from coupons where lead_id = ${leadId}
    `);
    if (existing[0]) return toCoupon(existing[0], false);
    // Otherwise the generated code collided with another lead's: try again.
  }
  throw new Error("Could not issue a unique coupon code");
}
