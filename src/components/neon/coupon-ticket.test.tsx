import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CouponTicket } from "./coupon-ticket";

describe("CouponTicket", () => {
  it("renders code and rules text derived from COUPON_RULES", () => {
    const expiresAt = new Date("2027-03-01T00:00:00Z");
    render(<CouponTicket code="CHARLY-TEST-1234" expiresAt={expiresAt} />);
    expect(screen.getByText("CHARLY-TEST-1234")).toBeInTheDocument();
    expect(screen.getByText(/15% off your 2nd order/i)).toBeInTheDocument();
    expect(screen.getByText(/\$30 minimum/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          `expires ${expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
          "i",
        ),
      ),
    ).toBeInTheDocument();
  });
});
