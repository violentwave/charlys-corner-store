import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";

import { ColorPicker } from "./color-picker";

const tshirt = getGarment("tshirt");

afterEach(() => cleanup());

function renderStrip(colors = { body: "#ffffff" }, onZoneColor = vi.fn()) {
  return render(<ColorPicker garment={tshirt} colors={colors} onZoneColor={onZoneColor} />);
}

describe("ColorPicker color strip", () => {
  it("labels every chip with the color name and marks the selected one with aria-pressed", () => {
    const { rerender } = renderStrip({ body: "#25282a" });
    const black = screen.getByRole("button", { name: "Black" });
    const white = screen.getByRole("button", { name: "White" });
    expect(black).toHaveAttribute("aria-pressed", "true");
    expect(white).toHaveAttribute("aria-pressed", "false");
    // Selected state is not color-only: a visible check icon too.
    expect(black).toHaveTextContent("✓");
    expect(white).not.toHaveTextContent("✓");

    rerender(<ColorPicker garment={tshirt} colors={{ body: "#ffffff" }} onZoneColor={vi.fn()} />);
    expect(screen.getByRole("button", { name: "White" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the selected color's name above the strip and the palette count", () => {
    renderStrip({ body: "#263147" });
    expect(screen.getByTestId("color-name-body")).toHaveTextContent("Navy");
    expect(screen.getByText(`${tshirt.palette.length} colors`)).toBeInTheDocument();
  });

  it("dispatches a palette hex when a chip is clicked", async () => {
    const user = userEvent.setup();
    const onZoneColor = vi.fn();
    renderStrip({ body: "#ffffff" }, onZoneColor);
    await user.click(screen.getByRole("button", { name: "Navy" }));
    expect(onZoneColor).toHaveBeenCalledWith("body", "#263147");
  });

  it("offers no free hex entry: only real blank colors (docs/04 §2 v2)", () => {
    renderStrip();
    expect(screen.queryByLabelText(/hex color/i)).toBeNull();
    expect(screen.queryByLabelText(/custom color/i, { selector: "input" })).toBeNull();
    expect(document.querySelectorAll("input[type=color]")).toHaveLength(0);
  });

  it("hoodie: one body color (lining and drawcords match), no separate parts", () => {
    const hoodie = getGarment("hoodie");
    render(<ColorPicker garment={hoodie} colors={hoodie.defaultColors} onZoneColor={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Hoodie color" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /lining|drawstring/i })).toBeNull();
  });

  it("combo blanks: one strip of real combos; a pick sets every part", async () => {
    const user = userEvent.setup();
    const raglan = getGarment("raglan");
    const onZoneColor = vi.fn();
    render(<ColorPicker garment={raglan} colors={raglan.defaultColors} onZoneColor={onZoneColor} />);
    expect(screen.getByRole("group", { name: "Color combo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "White / Black" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "White / Navy" }));
    expect(onZoneColor).toHaveBeenCalledWith("body", "#ffffff");
    expect(onZoneColor).toHaveBeenCalledWith("sleeves", "#1e2a44");
  });

  it("arrow keys move the selection, Home and End jump to the ends", async () => {
    window.history.pushState({}, "", "/design");
    const user = userEvent.setup();
    const onZoneColor = vi.fn();
    // Start from the first palette entry so the starting index is known.
    const firstColor = tshirt.palette[0]!;
    const view = (hex: string) =>
      render(<ColorPicker garment={tshirt} colors={{ body: hex }} onZoneColor={onZoneColor} />);
    const firstRender = view(firstColor.hex);
    const strip = firstRender.getByTestId("color-strip-body");

    strip.querySelector("button")!.focus();
    const secondColor = tshirt.palette[1]!;
    await user.keyboard("{ArrowRight}");
    expect(onZoneColor).toHaveBeenLastCalledWith("body", secondColor.hex);
    // The newly selected chip takes focus (roving focus).
    expect(strip.querySelectorAll("button")[1]).toHaveFocus();
    firstRender.unmount();

    // The parent applies the color: the second chip is selected after re-render.
    const secondRender = view(secondColor.hex);
    const chips2 = secondRender.getByTestId("color-strip-body").querySelectorAll("button");
    expect(chips2[1]).toHaveAttribute("aria-pressed", "true");

    await chips2[1]!.focus();
    await user.keyboard("{ArrowLeft}");
    expect(onZoneColor).toHaveBeenLastCalledWith("body", firstColor.hex);

    await user.keyboard("{End}");
    expect(onZoneColor).toHaveBeenLastCalledWith("body", tshirt.palette[tshirt.palette.length - 1]!.hex);

    await user.keyboard("{Home}");
    expect(onZoneColor).toHaveBeenLastCalledWith("body", firstColor.hex);
  });

  it("keeps the strip keyboard-safe at the ends: no wrap past the first or last color", async () => {
    const user = userEvent.setup();
    const onZoneColor = vi.fn();
    const firstColor = tshirt.palette[0]!;
    renderStrip({ body: firstColor.hex }, onZoneColor);
    const strip = screen.getByTestId("color-strip-body");
    strip.querySelector("button")!.focus();
    await user.keyboard("{ArrowLeft}");
    expect(onZoneColor).toHaveBeenLastCalledWith("body", firstColor.hex);
  });
});
