import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GarmentStep } from "./garment-step";

afterEach(() => cleanup());

describe("GarmentStep (continue-only, v3)", () => {
  it("picking a garment selects it but does NOT advance", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onContinue = vi.fn();
    render(<GarmentStep selectedId="tshirt" onSelect={onSelect} onContinue={onContinue} />);

    await user.click(screen.getByTestId("garment-hoodie"));
    expect(onSelect).toHaveBeenCalledWith("hoodie");
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("shows the selected garment and only Continue moves to step 2", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onContinue = vi.fn();
    render(<GarmentStep selectedId="longsleeve" onSelect={onSelect} onContinue={onContinue} />);

    // Visible selected state on the picked card.
    await expect(screen.getByTestId("garment-longsleeve")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByTestId("garment-continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled(); // the button alone doesn't pick anything
  });
});
