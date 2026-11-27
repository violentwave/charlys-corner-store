import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CartLink, cartLabel } from "./cart-link";

afterEach(() => cleanup());

describe("CartLink", () => {
  it("carries the count in words and shows the badge", () => {
    render(<CartLink count={3} />);
    expect(screen.getByTestId("cart-link")).toHaveAttribute("aria-label", "Cart, 3 designs");
    expect(screen.getByTestId("cart-count")).toHaveTextContent("3");
  });

  it("says empty (and hides the badge) when there is nothing in the cart", () => {
    render(<CartLink count={0} />);
    expect(screen.getByTestId("cart-link")).toHaveAttribute("aria-label", "Cart, empty");
    expect(screen.queryByTestId("cart-count")).toBeNull();
  });

  it("singularises one design", () => {
    expect(cartLabel(1)).toBe("Cart, 1 design");
  });
});
