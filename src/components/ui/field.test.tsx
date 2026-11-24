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

describe("Field with an explicit controlId (e.g. Radix Select)", () => {
  it("labels the inner control and links its error", async () => {
    const { Field: F, fieldControlProps } = await import("./field");
    render(
      <F label="Source" error="Pick one" controlId="src">
        <div>
          <button type="button" {...fieldControlProps("src", { error: "Pick one" })}>
            trigger
          </button>
        </div>
      </F>,
    );
    const control = screen.getByRole("button", { name: "Source" });
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAttribute("aria-describedby", "src-error");
    expect(document.getElementById("src-error")).toHaveTextContent("Pick one");
  });

  it("marks required controls aria-required", () => {
    render(
      <Field label="Name" required>
        <input />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: /name/i })).toHaveAttribute("aria-required", "true");
  });
});
