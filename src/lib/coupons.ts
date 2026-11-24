/**
 * "15% off your 2nd order" coupon rules (confirmed 2026-11-23, docs/02 §coupon logic).
 * Pure functions only — persistence and provider sync live elsewhere.
 */
export const COUPON_RULES = {
  percentOff: 15,
  expiryDays: 365,
  minOrderCents: 3000,
  perEmail: 1,
} as const;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L ambiguity

/** CHARLY-XXXX-XXXX using a CSPRNG. */
export function generateCouponCode(rand: (n: number) => Uint8Array = cryptoBytes): string {
  const bytes = rand(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `CHARLY-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

function cryptoBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function couponExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + COUPON_RULES.expiryDays * 24 * 60 * 60 * 1000);
}

export type CouponStatus = "issued" | "eligible" | "redeemed" | "expired";

export type CouponCheckInput = {
  status: CouponStatus;
  expiresAt: Date;
  completedOrdersForEmail: number;
  subtotalCents: number;
  now?: Date;
};

export type CouponCheckResult =
  | { ok: true; discountCents: number }
  | { ok: false; reason: "redeemed" | "expired" | "no_first_order" | "below_minimum" };

/** Server-side validity check for applying the coupon to an order subtotal (before tax/shipping). */
export function checkCoupon(input: CouponCheckInput): CouponCheckResult {
  const now = input.now ?? new Date();
  if (input.status === "redeemed") return { ok: false, reason: "redeemed" };
  if (input.status === "expired" || now >= input.expiresAt) return { ok: false, reason: "expired" };
  if (input.completedOrdersForEmail < 1) return { ok: false, reason: "no_first_order" };
  if (input.subtotalCents < COUPON_RULES.minOrderCents) return { ok: false, reason: "below_minimum" };
  return { ok: true, discountCents: Math.round((input.subtotalCents * COUPON_RULES.percentOff) / 100) };
}
