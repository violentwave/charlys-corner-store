import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";

import { ColorPicker } from "./color-picker";

const tshirt = getGarment("tshirt");

afterEach(() => cleanup());

describe("ColorPicker", () => {
  it("labels swatches with the color name and marks the selected one with aria-pressed", () => {
    const onZoneColor = vi.fn();
    render(<ColorPicker garment={tshirt} colors={{ body: "#1b1b1f" }} onZoneColor={onZoneColor} />);

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
    render(<ColorPicker garment={tshirt} colors={{ body: "#f4f4f4" }} onZoneColor={onZoneColor} />);
    await user.click(screen.getByRole("button", { name: "Navy" }));
    expect(onZoneColor).toHaveBeenCalledWith("body", "#1f2a44");
  });

  it("accepts a valid custom hex and notes the closest-blank match", async () => {
    const user = userEvent.setup();
    const onZoneColor = vi.fn();
    function Harness() {
      const [colors, setColors] = useState({ body: "#f4f4f4" });
      return (
        <ColorPicker
          garment={tshirt}
          colors={colors}
          onZoneColor={(zone, hex) => {
            onZoneColor(zone, hex);
            setColors((c) => ({ ...c, [zone]: hex }));
          }}
        />
      );
    }
    render(<Harness />);

    const hex = screen.getByLabelText("Custom Shirt hex color");
    await user.type(hex, "#ff2e97");
    expect(onZoneColor).toHaveBeenCalledWith("body", "#ff2e97");
    expect(screen.getByText(/We'll match the closest available blank/i)).toBeInTheDocument();
  });

  it("accepts a hex typed without the # and normalizes it", async () => {
    const user = userEvent.setup();
    const onZoneColor = vi.fn();
    render(<ColorPicker garment={tshirt} colors={{ body: "#f4f4f4" }} onZoneColor={onZoneColor} />);
    await user.type(screen.getByLabelText("Custom Shirt hex color"), "4b2e83");
    expect(onZoneColor).toHaveBeenCalledWith("body", "#4b2e83");
  });

  it("shows a friendly error and does not dispatch an invalid hex", async () => {
    const user = userEvent.setup();
    const onZoneColor = vi.fn();
    render(<ColorPicker garment={tshirt} colors={{ body: "#f4f4f4" }} onZoneColor={onZoneColor} />);

    const hex = screen.getByLabelText("Custom Shirt hex color");
    await user.type(hex, "zzz");
    expect(onZoneColor).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/6-digit hex/i);
  });

  it("labels the zone group with the config's zone label", () => {
    const hoodie = getGarment("hoodie");
    render(<ColorPicker garment={hoodie} colors={hoodie.defaultColors} onZoneColor={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Hood lining color" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Drawstrings color" })).toBeInTheDocument();
  });
});
