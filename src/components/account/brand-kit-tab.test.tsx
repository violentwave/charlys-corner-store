import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrandKitTab } from "./brand-kit-tab";
import type { BrandKit } from "@/app/api/account/brand-kit/route";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const kit = (over: Partial<BrandKit> = {}): BrandKit => ({
  inkColors: ["#ff0000"],
  fonts: ["anton"],
  logo: null,
  ...over,
});

function renderWith(brandKit: BrandKit = kit()) {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes("/api/account/brand-kit") && String(url) !== "/api/account/brand-kit") {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, brandKit }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, brandKit }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<BrandKitTab />);
}

describe("BrandKitTab", () => {
  it("shows the saved inks and fonts, and explains what the kit does", async () => {
    renderWith(kit({ inkColors: ["#ff0000", "#00ff00"], fonts: ["anton", "oswald"] }));
    await screen.findByTestId("brand-kit");
    expect(screen.getByLabelText(/Remove ink #ff0000/i)).toBeVisible();
    expect(screen.getByTestId("brand-font-remove-oswald")).toBeVisible();
    expect(screen.getByText(/show up first in the designer/i)).toBeVisible();
  });

  it("caps colors at 8: the add row disappears and the cap note shows", async () => {
    const eight = Array.from({ length: 8 }, (_, i) => `#00000${i}`);
    renderWith(kit({ inkColors: eight }));
    await screen.findByTestId("brand-kit");
    expect(screen.queryByTestId("brand-ink-add")).toBeNull();
    expect(screen.getByTestId("brand-inks-cap")).toHaveTextContent(/8 colors is the max/i);
  });

  it("caps fonts at 4", async () => {
    renderWith(kit({ fonts: ["anton", "oswald", "bebas-neue", "montserrat"] }));
    await screen.findByTestId("brand-kit");
    expect(screen.queryByTestId("brand-font-picker")).toBeNull();
    expect(screen.getByTestId("brand-fonts-cap")).toHaveTextContent(/4 fonts is the max/i);
  });

  it("rejects a duplicate color client-side", async () => {
    const user = userEvent.setup();
    renderWith(kit({ inkColors: ["#000000"] }));
    await screen.findByTestId("brand-kit");
    await user.click(screen.getByTestId("brand-ink-add")); // the picker defaults to black
    expect(await screen.findByText(/already in your kit/i)).toBeInTheDocument();
  });

  it("saves via the multipart PUT and reports the saved kit", async () => {
    const user = userEvent.setup();
    renderWith(kit({ inkColors: [] }));
    await screen.findByTestId("brand-kit");
    await user.click(screen.getByTestId("brand-ink-add")); // adds the default black
    await user.click(screen.getByTestId("brand-kit-save"));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/account/brand-kit" && (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(put).toBeTruthy();
      expect((put![1].body as FormData).get("payload")).not.toBeNull();
    });
    expect(screen.queryByTestId("brand-kit-error")).toBeNull();
  });
});
