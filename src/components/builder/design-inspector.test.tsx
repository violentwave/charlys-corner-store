import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";
import { MAX_LAYERS_PER_VIEW } from "@/lib/mockup-schema";

import { DesignInspector } from "./design-inspector";
import {
  defaultTextLayer,
  type BuilderImageLayer,
  type BuilderLayer,
  type BuilderViewState,
} from "./use-builder-state";

afterEach(() => cleanup());
beforeEach(() => sessionStorage.clear());

const garment = getGarment("tshirt");
const view = garment.views[0]!;
const area = view.printAreas.find((a) => a.id === "full-front")!;

const imageLayer = (id: string, fileIndex = 0): BuilderImageLayer => ({
  id,
  type: "image",
  fileIndex,
  name: `art-${fileIndex}.png`,
  kind: "png",
  naturalWidth: 3000,
  naturalHeight: 3000,
  transform: { x: 100, y: 100, width: 300, height: 300, rotation: 0, flipX: false, skewX: 0, skewY: 0 },
});

const textLayer = (id: string): BuilderLayer => ({
  id,
  ...defaultTextLayer(area.rect, { text: "RUFF", font: "anton", color: "#000000" }),
});

function setup(layers: BuilderLayer[], selectedLayerId: string | null = layers[0]?.id ?? null) {
  const viewState: BuilderViewState = { printArea: area.id, layers, selectedLayerId };
  const props = {
    view,
    views: garment.views,
    viewState,
    artByView: { front: layers.length > 0 } as Partial<Record<string, boolean>>,
    files: layers
      .filter((l): l is BuilderImageLayer => l.type === "image")
      .map((l) => ({ index: l.fileIndex, url: `blob:art-${l.fileIndex}`, name: `art-${l.fileIndex}.png` })),
    selectedFileReady: true,
    fileError: null,
    capReached: layers.length >= MAX_LAYERS_PER_VIEW,
    accountEmail: "pup@example.com",
    lockRatio: false,
    onLockRatioChange: vi.fn(),
    onUploadClick: vi.fn(),
    onDropFile: vi.fn(),
    onAddText: vi.fn(),
    onViewChange: vi.fn(),
    onSetPrintArea: vi.fn(),
    onSelectLayer: vi.fn(),
    onTransform: vi.fn(),
    onTextChange: vi.fn(),
    onOutlineChange: vi.fn(),
    onRemoveLayer: vi.fn(),
    onDuplicateLayer: vi.fn(),
    onMoveLayer: vi.fn(),
  };
  render(<DesignInspector {...props} />);
  return props;
}

describe("DesignInspector (simple panel)", () => {
  it("hides the layers list at 0 layers (the canvas empty state guides instead)", () => {
    setup([]);
    expect(screen.queryByTestId("layers-panel")).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Layers/ })).toBeNull();
  });

  it("hides the layers list at 1 layer — the selected-item panel covers it", () => {
    setup([imageLayer("a")]);
    expect(screen.queryByTestId("layers-panel")).toBeNull();
    expect(screen.getByRole("heading", { name: "Selected image" })).toBeVisible();
  });

  it("shows the layers list with a count once the side has two layers", () => {
    setup([imageLayer("a"), textLayer("b")]);
    expect(screen.getByRole("heading", { name: "Layers (2)" })).toBeVisible();
    expect(screen.getByTestId("layers-panel")).toBeVisible();
  });

  it("shows the 8-per-side cap note only when the cap is reached", () => {
    const eight = Array.from({ length: MAX_LAYERS_PER_VIEW }, (_, i) => imageLayer(`l${i}`, i % 4));
    setup(eight);
    expect(screen.getByTestId("layers-cap")).toBeVisible();
  });

  it("keeps the selected-item actions wired: duplicate and delete hit the selected layer", async () => {
    const user = userEvent.setup();
    const props = setup([imageLayer("a"), textLayer("b")], "b");
    await user.click(screen.getByRole("button", { name: "Delete this layer" }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(props.onRemoveLayer).toHaveBeenCalledWith("b");
    expect(props.onDuplicateLayer).toHaveBeenCalledWith("b");
  });

  it("shows the printed size line for text layers too", () => {
    setup([textLayer("b")]);
    expect(screen.getByTestId("printed-size")).toHaveTextContent(/Printed size: about \d+\.\d″ × \d+\.\d″/);
  });

  it("warns about low-resolution images on top of the printed size line", () => {
    // 200px over ~9.4in wide is way under 150 DPI.
    setup([{ ...imageLayer("a"), naturalWidth: 200, naturalHeight: 200 }]);
    expect(screen.getByTestId("printed-size")).toBeVisible();
    expect(screen.getByTestId("dpi-warning")).toBeVisible();
  });

  it("Signed in as is the last thing in the panel", () => {
    setup([textLayer("b")]);
    const panel = screen.getByTestId("artwork-controls");
    expect(panel.lastElementChild).toHaveTextContent("Signed in as pup@example.com");
  });

  it("the side buttons and the print location sit in the same Side section", () => {
    setup([imageLayer("a")]);
    expect(screen.getByTestId("view-front")).toBeVisible();
    expect(screen.getByTestId("print-location")).toBeVisible();
  });
});
