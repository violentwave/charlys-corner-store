import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MyDesigns } from "./my-designs";
import type { AccountMockup } from "@/app/api/account/mockups/route";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const expireAt = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

const mockup = (over: Partial<AccountMockup> = {}): AccountMockup => ({
  id: "m1",
  kind: "mockup",
  garmentName: "T-Shirt",
  createdAt: new Date().toISOString(),
  status: "new",
  colors: [{ label: "Shirt", name: "Black", hex: "#000000" }],
  sizes: [],
  views: [
    {
      view: "front",
      area: "Full Front",
      imageUrl: "https://storage.example/mockup-front.png",
      downloadUrl: "https://storage.example/mockup-front.png",
    },
  ],
  filesExpired: false,
  filesExpireAt: expireAt(29),
  removal: "delete",
  restorePath: "/?mockup=m1",
  orderStage: null,
  canResend: false,
  canReorder: false,
  ...over,
});

const order: AccountMockup = {
  id: "o1",
  kind: "order",
  garmentName: "T-Shirt",
  createdAt: new Date().toISOString(),
  status: "new",
  colors: [{ label: "Shirt", name: "Navy", hex: "#1a2a4a" }],
  sizes: ["2 × M"],
  views: [{ view: "front", area: "Full Front", imageUrl: null, downloadUrl: null }],
  filesExpired: false,
  filesExpireAt: null,
  removal: "hide",
  restorePath: "/?mockup=o1",
  orderStage: null,
  canResend: false,
  canReorder: false,
};

function renderWith(items: AccountMockup[]) {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes("/api/account/mockups/")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, result: "deleted" }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, items }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<MyDesigns email="me@example.com" />);
}

describe("MyDesigns (retention + delete)", () => {
  it("warns that emailed mockups expire, with the retention constant's number", async () => {
    renderWith([mockup()]);
    const banner = await screen.findByTestId("retention-banner");
    expect(banner).toHaveTextContent(/kept for 30 days/i);
    expect(banner).toHaveTextContent(/save the ones you want to keep/i);
  });

  it("an emailed mockup shows its deletion date and a Save link while the files exist", async () => {
    renderWith([mockup()]);
    expect(await screen.findByTestId("save-front")).toHaveAttribute("download");
    expect(screen.getByTestId("retention-status")).toHaveTextContent(/Images deleted on/i);
  });

  it("a mockup expiring within a week gets a days-left warning (not color-only)", async () => {
    renderWith([mockup({ filesExpireAt: expireAt(3) })]);
    await screen.findByTestId("save-front");
    expect(screen.getByTestId("expiry-warning")).toHaveTextContent(/3 days left/);
    expect(screen.getByTestId("expiry-warning")).toHaveTextContent("⚠"); // glyph + text, not color alone
  });

  it("an expired mockup says the images are gone and offers no Save", async () => {
    renderWith([
      mockup({
        filesExpired: true,
        filesExpireAt: expireAt(-2),
        views: [{ view: "front", area: "Full Front", imageUrl: null, downloadUrl: null }],
      }),
    ]);
    await screen.findByTestId("retention-status");
    expect(screen.queryByTestId("save-front")).toBeNull();
    expect(screen.getByTestId("retention-status")).toHaveTextContent(/Images deleted/i);
  });

  it("an order request never shows a countdown — the shop keeps it", async () => {
    const user = userEvent.setup();
    renderWith([order]);
    await user.click(await screen.findByRole("tab", { name: /Order requests/i }));
    expect(screen.getByTestId("kept-by-shop")).toHaveTextContent("Kept by the shop");
    expect(screen.getByTestId("retention-banner")).toHaveTextContent(/emailed mockups/i); // banner is still there
  });

  it("the confirm dialog says the mockup is deleted for good — and tells them to save first", async () => {
    const user = userEvent.setup();
    renderWith([mockup()]);
    await user.click(await screen.findByTestId("delete-design"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/Delete this mockup\?/i);
    expect(dialog).toHaveTextContent(/deleted for good\. Save them first/i);
  });

  it("the confirm dialog says an order request is only hidden here — the shop keeps it", async () => {
    const user = userEvent.setup();
    renderWith([order]);
    await user.click(await screen.findByRole("tab", { name: /Order requests/i }));
    await user.click(await screen.findByTestId("hide-design"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/Remove this order from your list\?/i);
    expect(dialog).toHaveTextContent(/The shop still has your order; this only hides it here\./i);
  });

  it("confirming a delete calls DELETE on the design and removes the card, announced politely", async () => {
    const user = userEvent.setup();
    renderWith([mockup()]);
    await user.click(await screen.findByTestId("delete-design"));
    await user.click(screen.getByTestId("confirm-remove"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/mockups/m1"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(screen.queryByText(/T-Shirt/i)).toBeNull()); // card gone
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(/Mockup deleted\./i);
  });

  it("confirming a hide announces the shop still has the order", async () => {
    const user = userEvent.setup();
    renderWith([order]);
    await user.click(await screen.findByRole("tab", { name: /Order requests/i }));
    await user.click(await screen.findByTestId("hide-design"));
    await user.click(screen.getByTestId("confirm-remove"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/mockups/o1"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(screen.queryByText(/Order requests \(1\)/i)).toBeNull());
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(/The shop still has it\./i);
  });
});
