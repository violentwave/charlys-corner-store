import { describe, expect, it } from "vitest";

import { COUPON_RULES } from "@/lib/coupons";
import { faq } from "./faq";

describe("faq coupon answer", () => {
  it("contains the COUPON_RULES values", () => {
    const couponItem = faq.find((item) => /coupon/i.test(item.question));
    expect(couponItem).toBeDefined();
    const answer = couponItem!.answer;
    expect(answer).toContain(`${COUPON_RULES.percentOff}%`);
    expect(answer).toContain(`${COUPON_RULES.expiryDays} days`);
    expect(answer).toContain(`$${COUPON_RULES.minOrderCents / 100}`);
  });
});

describe("faq answers", () => {
  it("never put raw site paths in answer text (use links)", () => {
    for (const item of faq) expect(item.answer).not.toMatch(/(^|\s)\/[a-z]/);
  });
});
