import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayersPanel } from "./layers-panel";

afterEach(() => cleanup());

const rows = [
  { id: "a", type: "text" as const, name: "TOP" },
  { id: "b", type: "image" as const, name: "middle.png" },
  { id: "c", type: "text" as const, name: "BOTTOM" },
];

describe("LayersPanel", () => {
  it("every row can move both ways except past the ends", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(
      <LayersPanel
        rows={rows}
        selectedId="b"
        onSelect={vi.fn()}
        onMove={onMove}
        onDuplicate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Move TOP up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move BOTTOM down" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move middle.png down" }));
    await user.click(screen.getByRole("button", { name: "Move middle.png up" }));
    expect(onMove.mock.calls).toEqual([
      ["b", "down"],
      ["b", "up"],
    ]);
    // Selection is not color-only.
    expect(screen.getByTestId("layer-select-b")).toHaveAttribute("aria-pressed", "true");
  });

  it("deletes and duplicates by keyboard", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onDuplicate = vi.fn();
    render(
      <LayersPanel
        rows={rows}
        selectedId={null}
        onSelect={vi.fn()}
        onMove={vi.fn()}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
      />,
    );
    screen.getByRole("button", { name: "Delete BOTTOM" }).focus();
    await user.keyboard("{Enter}");
    screen.getByRole("button", { name: "Duplicate TOP" }).focus();
    await user.keyboard(" ");
    expect(onRemove).toHaveBeenCalledWith("c");
    expect(onDuplicate).toHaveBeenCalledWith("a");
  });
});
