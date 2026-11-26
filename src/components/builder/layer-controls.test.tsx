import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";

import { LayerControls } from "./layer-controls";
import { defaultTextLayer, type BuilderTextLayer } from "./use-builder-state";

afterEach(() => cleanup());
// The disclosures remember their open state for the session — start each test fresh.
beforeEach(() => sessionStorage.clear());

const area = getGarment("tshirt").views[0]!.printAreas.find((a) => a.id === "full-front")!;
const textLayer = (patch: Partial<BuilderTextLayer> = {}): BuilderTextLayer => ({
  id: "t1",
  ...defaultTextLayer(area.rect, { text: "RUFF", font: "anton", color: "#000000" }),
  ...patch,
});

function setup(layer = textLayer()) {
  const props = {
    area,
    textLayer: layer,
    lockRatio: false,
    onLockRatioChange: vi.fn(),
    onTransform: vi.fn(),
    onTextChange: vi.fn(),
    onOutlineChange: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
  };
  const utils = render(<LayerControls {...props} />);
  return { ...utils, props };
}

/**
 * Opens a <details> disclosure. jsdom doesn't synthesize Enter-activation on <summary>
 * (real browsers do — covered in the e2e), so activate the summary with a click, which
 * is the same activation path keyboard users get.
 */
async function openDisclosure(user: ReturnType<typeof userEvent.setup>, testid: string) {
  const section = screen.getByTestId(testid);
  expect(section).not.toHaveAttribute("open"); // collapsed by default
  await user.click(section.querySelector("summary")!);
  return section;
}

describe("LayerControls (simple panel)", () => {
  it("shows text, font and the quick inks without opening anything", () => {
    setup();
    expect(screen.getByTestId("text-layer-input")).toBeVisible();
    expect(screen.getByTestId("text-layer-font")).toBeVisible();
    expect(screen.getByTestId("ink-swatches")).toBeVisible();
    // The advanced stuff stays folded.
    expect(screen.getByTestId("text-style-section")).not.toHaveAttribute("open");
    expect(screen.getByTestId("size-rotation-section")).not.toHaveAttribute("open");
  });

  it("never commits blank text, and says what to do", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    const input = screen.getByTestId("text-layer-input");
    await user.clear(input);
    expect(props.onTextChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Type something/)).toBeInTheDocument();
    await user.type(input, "W");
    expect(props.onTextChange).toHaveBeenLastCalledWith({ text: "W" }, "t1:text");
  });

  it("caps text at 60 characters", () => {
    setup();
    expect(screen.getByTestId("text-layer-input")).toHaveAttribute("maxLength", "60");
  });

  it("quick swatches set the ink", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Ink: Hot pink" }));
    expect(props.onTextChange).toHaveBeenLastCalledWith({ color: "#ff69b4" }, "t1:color");
  });

  it("marks the active quick swatch without relying on color alone", () => {
    setup(textLayer({ color: "#ffffff" }));
    expect(screen.getByRole("button", { name: "Ink: White" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ink: Black" })).toHaveAttribute("aria-pressed", "false");
  });

  it("the Custom swatch opens the color picker and the hex field", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    expect(screen.queryByTestId("text-layer-color")).toBeNull(); // folded
    await user.click(screen.getByRole("button", { name: "Custom ink color" }));
    const hex = screen.getByLabelText("Ink color hex");
    await user.clear(hex);
    await user.type(hex, "#FF2E97");
    expect(props.onTextChange).toHaveBeenLastCalledWith({ color: "#ff2e97" }, "t1:color");
  });

  it("opens custom ink by itself when the layer's color isn't a quick swatch", () => {
    setup(textLayer({ color: "#123456" }));
    expect(screen.getByTestId("custom-ink")).toBeInTheDocument();
  });

  it("the action row duplicates and deletes the selected layer", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Delete this layer" }));
    expect(props.onDuplicate).toHaveBeenCalledTimes(1);
    expect(props.onRemove).toHaveBeenCalledTimes(1);
  });

  it("the action row's Center, Fit and Flip transform the layer", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Center" }));
    await user.click(screen.getByRole("button", { name: "Fit" }));
    await user.click(screen.getByRole("button", { name: "Flip" }));
    expect(props.onTransform).toHaveBeenCalledTimes(3);
    expect(props.onTransform.mock.calls[2]![0].flipX).toBe(true);
  });

  it("Text style starts collapsed and opens by click or keyboard, revealing outline, spacing and arch", async () => {
    const user = userEvent.setup();
    setup();
    const section = await openDisclosure(user, "text-style-section");
    expect(section).toHaveAttribute("open");
    expect(screen.getByTestId("text-layer-outline")).toBeVisible();
    expect(screen.getByTestId("text-layer-spacing")).toBeVisible();
    expect(screen.getByTestId("text-layer-curve")).toBeVisible();
  });

  it("Size & rotation starts collapsed and opens by click or keyboard", async () => {
    const user = userEvent.setup();
    setup();
    const section = await openDisclosure(user, "size-rotation-section");
    expect(section).toHaveAttribute("open");
    expect(screen.getByTestId("layer-w")).toBeVisible();
    expect(screen.getByTestId("layer-rotate")).toBeVisible();
  });

  it("has no skew controls (removed 2026-11-26)", () => {
    setup();
    expect(screen.queryByTestId("skew-horizontal")).toBeNull();
    expect(screen.queryByTestId("reset-skew")).toBeNull();
  });

  it("arch slider follows the layer and sends a -1…1 curve", async () => {
    const user = userEvent.setup();
    const { props, rerender } = setup(textLayer({ curve: 0.5 }));
    await openDisclosure(user, "text-style-section");
    const slider = screen.getByTestId("text-layer-curve") as HTMLInputElement;
    expect(slider.value).toBe("50");
    expect(slider).toHaveAttribute("aria-valuetext", "Arched up 50 percent");
    rerender(<LayerControls {...props} textLayer={textLayer()} />);
    expect(slider.value).toBe("0");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(slider, { target: { value: "-40" } });
    expect(props.onTextChange).toHaveBeenLastCalledWith({ curve: -0.4 }, "t1:curve");
  });

  it("number fields commit on Enter and ignore junk", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await openDisclosure(user, "size-rotation-section");
    const rotate = screen.getByLabelText("Rotation in degrees");
    await user.clear(rotate);
    await user.tab();
    expect(props.onTransform).not.toHaveBeenCalled();
    await user.clear(rotate);
    await user.type(rotate, "45{Enter}");
    expect(props.onTransform).toHaveBeenCalledTimes(1);
    expect(props.onTransform.mock.calls[0]![0].rotation).toBe(45);
  });

  it("brand kit inks come first under 'Your colors', then the quick defaults", async () => {
    const user = userEvent.setup();
    render(
      <LayerControls
        {...{
          area,
          textLayer: textLayer(),
          lockRatio: false,
          onLockRatioChange: vi.fn(),
          onTransform: vi.fn(),
          onTextChange: vi.fn(),
          onOutlineChange: vi.fn(),
          onDuplicate: vi.fn(),
          onRemove: vi.fn(),
          brandInks: ["#123456", "#abcdef"],
        }}
      />,
    );
    expect(screen.getByTestId("brand-inks")).toBeVisible();
    expect(screen.getByText("Your colors")).toBeVisible();
    // The brand swatch sets the ink (lowercased).
    await user.click(screen.getByTestId("brand-ink-123456"));
    // The defaults row is still there, labeled.
    expect(screen.getByText("Quick colors")).toBeVisible();
    expect(screen.getByTestId("ink-black")).toBeVisible();
  });
});
