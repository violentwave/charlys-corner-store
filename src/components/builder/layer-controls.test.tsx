import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";

import { LayerControls } from "./layer-controls";
import { defaultTextLayer, type BuilderTextLayer } from "./use-builder-state";

afterEach(() => cleanup());

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
  };
  const utils = render(<LayerControls {...props} />);
  return { ...utils, props };
}

describe("LayerControls", () => {
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

  it("skew sliders follow the layer (Undo / Reset skew) and send tan(deg)", () => {
    const { props, rerender } = setup(
      textLayer({ transform: { ...textLayer().transform, skewX: Math.tan(Math.PI / 9) } }),
    );
    const slider = screen.getByTestId("skew-horizontal") as HTMLInputElement;
    expect(slider.value).toBe("20");
    rerender(<LayerControls {...props} textLayer={textLayer()} />);
    expect(slider.value).toBe("0");
    fireEvent.change(slider, { target: { value: "-31" } });
    const [transform, key] = props.onTransform.mock.calls.at(-1)!;
    expect(transform.skewX).toBeCloseTo(-0.6, 2);
    expect(key).toBe("t1:skewX");
  });

  it("number fields commit on Enter and ignore junk", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    const rotate = screen.getByLabelText("Rotation in degrees");
    await user.clear(rotate);
    await user.tab();
    expect(props.onTransform).not.toHaveBeenCalled();
    await user.clear(rotate);
    await user.type(rotate, "45{Enter}");
    expect(props.onTransform).toHaveBeenCalledTimes(1);
    expect(props.onTransform.mock.calls[0]![0].rotation).toBe(45);
  });

  it("hex field accepts partial typing and commits a full color", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    const hex = screen.getByLabelText("Ink color hex");
    await user.clear(hex);
    await user.type(hex, "#FF2E97");
    expect(hex).toHaveValue("#FF2E97");
    expect(props.onTextChange).toHaveBeenLastCalledWith({ color: "#ff2e97" }, "t1:color");
  });
});
