import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "./drafts";
import type { DraftSummary } from "@/app/api/account/drafts/route";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const expireAt = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

const draft = (over: Partial<DraftSummary> = {}): DraftSummary => ({
  id: "d1",
  name: "Fundraiser front",
  garment: "tshirt",
  updatedAt: new Date().toISOString(),
  imageCount: 2,
  filesExpireAt: expireAt(29),
  ...over,
});

function renderWith(drafts: DraftSummary[]) {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes("/api/account/drafts/d1")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, drafts }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Drafts />);
}

describe("Drafts tab", () => {
  it("lists drafts with the garment's name, the save date and the image count", async () => {
    renderWith([draft()]);
    await screen.findByTestId("drafts");
    expect(screen.getByText("Fundraiser front")).toBeVisible();
    expect(screen.getByTestId("draft-meta-d1")).toHaveTextContent(/T-Shirt · Saved .* · 2 images/i);
  });

  it("carries the 30-day note and the per-draft deletion date", async () => {
    renderWith([draft()]);
    await screen.findByTestId("drafts");
    expect(screen.getByTestId("drafts-note")).toHaveTextContent(/kept 30 days after each save/i);
    expect(screen.getByTestId("draft-expiry-d1")).toHaveTextContent(/Images deleted on/i);
  });

  it("warns when the images expire within a week (not color-only)", async () => {
    renderWith([draft({ filesExpireAt: expireAt(4) })]);
    await screen.findByTestId("drafts");
    expect(screen.getByTestId("draft-expiry-warning-d1")).toHaveTextContent(/4 days left/);
    expect(screen.getByTestId("draft-expiry-warning-d1")).toHaveTextContent("⚠");
  });

  it("delete asks first, then the row is gone and it's announced", async () => {
    const user = userEvent.setup();
    renderWith([draft()]);
    await user.click(await screen.findByTestId("delete-draft-d1"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/Delete .Fundraiser front./i);
    await user.click(screen.getByTestId("confirm-delete-draft"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/account/drafts/d1", expect.objectContaining({ method: "DELETE" })),
    );
    await waitFor(() => expect(screen.queryByText("Fundraiser front")).toBeNull());
  });

  it("Open goes to the builder with the draft id", async () => {
    renderWith([draft()]);
    const open = await screen.findByTestId(`open-draft-d1`);
    expect(open).toHaveAttribute("href", "/?draft=d1#design");
  });

  it("the empty state links to the builder", async () => {
    renderWith([]);
    const empty = await screen.findByTestId("drafts-empty");
    expect(empty).toHaveTextContent(/No saved drafts yet/i);
    expect(screen.getByRole("link", { name: /Open the designer/i })).toHaveAttribute("href", "/#design");
  });
});
