import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CouponTicket, formatExpiry } from "./coupon-ticket";

describe("CouponTicket", () => {
  it("renders code and rules text derived from COUPON_RULES", () => {
    const expiresAt = new Date("2027-03-01T00:00:00Z");
    render(<CouponTicket code="CHARLY-TEST-1234" expiresAt={expiresAt} />);
    expect(screen.getByText("CHARLY-TEST-1234")).toBeInTheDocument();
    expect(screen.getByText(/15% off your 2nd order/i)).toBeInTheDocument();
    expect(screen.getByText(/\$30 minimum/i)).toBeInTheDocument();
    expect(screen.getByText(/expires Feb 28, 2027/i)).toBeInTheDocument();
  });

  it("formats expiry in the shop's time zone regardless of the machine's", () => {
    // 03:00 UTC on Mar 1 is still Feb 28 in Port St. Lucie
    expect(formatExpiry(new Date("2027-03-01T03:00:00Z"))).toBe("Feb 28, 2027");
    expect(formatExpiry(new Date("2027-03-01T12:00:00Z"))).toBe("Mar 1, 2027");
  });
});
