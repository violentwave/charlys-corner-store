import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";

import { ColorPicker } from "./color-picker";

const tshirt = getGarment("tshirt");

afterEach(() => cleanup());

describe("ColorPicker", () => {
  it("labels swatches with the color name and marks the selected one with aria-pressed", () => {
    const onZoneColor = vi.fn();
    render(<ColorPicker garment={tshirt} colors={{ body: "#25282a" }} onZoneColor={onZoneColor} />);

    const black = screen.getByRole("button", { name: "Black" });
    const white = screen.getByRole("button", { name: "White" });
    expect(black).toHaveAttribute("aria-pressed", "true");
    expect(white).toHaveAttribute("aria-pressed", "false");
    // Selected state is not color-only: a visible check icon too.
    expect(black).toHaveTextContent("✓");
    expect(white).not.toHaveTextContent("✓");
  });

  it("dispatches a hex when a swatch is clicked", async () => {
    const user = userEvent.setup();
    const onZoneColor = vi.fn();
    render(<ColorPicker garment={tshirt} colors={{ body: "#ffffff" }} onZoneColor={onZoneColor} />);
    await user.click(screen.getByRole("button", { name: "Navy" }));
    expect(onZoneColor).toHaveBeenCalledWith("body", "#263147");
  });

  it("offers no free hex entry: only real blank colors (decided 2026-11-25)", () => {
    render(<ColorPicker garment={tshirt} colors={{ body: "#ffffff" }} onZoneColor={vi.fn()} />);
    expect(screen.queryByLabelText(/hex color/i)).toBeNull();
  });

  it("labels the zone group with the config's zone label", () => {
    const hoodie = getGarment("hoodie");
    render(<ColorPicker garment={hoodie} colors={hoodie.defaultColors} onZoneColor={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Hood lining color" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Drawstrings color" })).toBeInTheDocument();
  });
});
