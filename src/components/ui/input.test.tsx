import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("forwards ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} placeholder="name" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    ref.current?.focus();
    expect(screen.getByPlaceholderText("name")).toHaveFocus();
  });
});
