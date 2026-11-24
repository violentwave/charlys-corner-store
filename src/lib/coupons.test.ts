import { describe, expect, it } from "vitest";
import { checkCoupon, COUPON_RULES, couponExpiry, generateCouponCode } from "./coupons";

const issued = new Date("2026-01-01T00:00:00Z");
const base = {
  status: "eligible" as const,
  expiresAt: couponExpiry(issued),
  completedOrdersForEmail: 1,
  subtotalCents: 5000,
  now: new Date("2026-06-01T00:00:00Z"),
};

describe("generateCouponCode", () => {
  it("matches CHARLY-XXXX-XXXX with unambiguous characters", () => {
    expect(generateCouponCode()).toMatch(/^CHARLY-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });
  it("is effectively unique", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateCouponCode()));
    expect(codes.size).toBe(500);
  });
});

describe("couponExpiry", () => {
  it("is one year after issue", () => {
    expect(couponExpiry(issued).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("checkCoupon", () => {
  it("applies 15% when all rules pass", () => {
    expect(checkCoupon(base)).toEqual({ ok: true, discountCents: 750 });
  });
  it("requires a completed first order", () => {
    expect(checkCoupon({ ...base, completedOrdersForEmail: 0 })).toEqual({ ok: false, reason: "no_first_order" });
  });
  it("enforces the $30 minimum (exactly $30 passes)", () => {
    expect(checkCoupon({ ...base, subtotalCents: 2999 })).toEqual({ ok: false, reason: "below_minimum" });
    expect(checkCoupon({ ...base, subtotalCents: COUPON_RULES.minOrderCents }).ok).toBe(true);
  });
  it("rejects expired and redeemed coupons", () => {
    expect(checkCoupon({ ...base, now: new Date("2027-01-02T00:00:00Z") })).toEqual({ ok: false, reason: "expired" });
    expect(checkCoupon({ ...base, status: "redeemed" })).toEqual({ ok: false, reason: "redeemed" });
  });
});
