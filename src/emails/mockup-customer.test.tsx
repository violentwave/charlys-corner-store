// @vitest-environment node
/** The customer mockup email carries the restore-design deep link (docs/04 §Emails). */
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";

import { MockupCustomerEmail } from "./mockup-customer";

describe("MockupCustomerEmail", () => {
  it("CTA links to /design?mockup=<id> so the builder can restore the design", async () => {
    const html = await render(
      MockupCustomerEmail({
        name: "Charly",
        garmentName: "T-Shirt",
        colors: [{ label: "Shirt", hex: "#2233aa", name: "Custom #2233aa" }],
        views: [{ view: "Front", area: "Full Front" }],
        coupon: { code: "CHARLY-ABCD-EFGH", expiresAt: new Date("2027-11-25"), isNew: true },
        mockups: [{ view: "front", signedUrl: "https://r2.example/mockup-front.png" }],
        mockupId: "123e4567-e89b-42d3-a456-426614174000",
      }),
    );
    const text = await render(
      MockupCustomerEmail({
        name: "Charly",
        garmentName: "T-Shirt",
        colors: [{ label: "Shirt", hex: "#2233aa", name: "Custom #2233aa" }],
        views: [{ view: "Front", area: "Full Front" }],
        coupon: { code: "CHARLY-ABCD-EFGH", expiresAt: new Date("2027-11-25"), isNew: true },
        mockups: [{ view: "front", signedUrl: "https://r2.example/mockup-front.png" }],
        mockupId: "123e4567-e89b-42d3-a456-426614174000",
      }),
      { plainText: true },
    );

    const expected = /design\?mockup=123e4567-e89b-42d3-a456-426614174000/;
    expect(html).toMatch(expected);
    expect(html).toContain("Order this design");
    expect(text).toContain("Order this design");
  });
});
