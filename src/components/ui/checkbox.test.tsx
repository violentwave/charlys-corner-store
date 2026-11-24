import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { cleanup } from "@testing-library/react";
import { Checkbox } from "./checkbox";

afterEach(() => cleanup());

describe("Checkbox", () => {
  it("toggles via Space", async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Accept" />);
    const checkbox = screen.getByRole("checkbox", { name: "Accept" });
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
  });

  it("toggles via label click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Checkbox id="agree" />
        <label htmlFor="agree">Agree</label>
      </div>,
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await user.click(screen.getByText("Agree"));
    expect(checkbox).toBeChecked();
  });
});
