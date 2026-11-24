import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "./field";
import { Input } from "./input";

describe("Field", () => {
  it("wires label, aria-describedby, and aria-invalid", () => {
    render(
      <Field label="Email" hint="We'll never share it." error="Invalid email." required>
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText(/Email/i);
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).not.toBe("");
    // hint and error ids both referenced
    expect(describedBy.split(" ").length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText("(required)")).toBeInTheDocument();
    expect(screen.getByText("Invalid email.")).toBeInTheDocument();
  });
});
