import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SizeSets } from "./size-sets";
import { combineSizesAndRoster, sizesTotal } from "@/lib/member-schemas";
import type { SizeSet } from "@/lib/size-sets";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const SET: SizeSet = {
  id: "set-1",
  name: "Fundraiser",
  sizes: { M: 4, L: 1 },
  roster: [
    { name: "Ana", size: "S" },
    { name: "Bo", size: "M" },
  ],
  updatedAt: new Date().toISOString(),
};

function setup(list: SizeSet[] = []) {
  fetchMock.mockImplementation(() => {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, sizeSets: list }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<SizeSets />);
}

describe("SizeSets", () => {
  it("lists saved sets with piece + roster counts", async () => {
    setup([SET]);
    await screen.findByTestId("size-sets");
    expect(screen.getByText("Fundraiser")).toBeVisible();
    expect(screen.getByTestId("size-set-summary-set-1")).toHaveTextContent("5 pieces · 2 roster rows");
  });

  it("saving a set posts it (zeros dropped) and returns to the list", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByTestId("new-size-set"));
    await screen.findByTestId("size-set-editor");
    await user.type(screen.getByTestId("size-set-name"), "Fundraiser");
    await user.type(screen.getByTestId("size-set-size-M"), "4");
    await user.click(screen.getByTestId("save-size-set"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/account/size-sets", expect.objectContaining({ method: "POST" })),
    );
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === "/api/account/size-sets" && (init as RequestInit | undefined)?.method === "POST",
    );
    const body = JSON.parse(postCall![1].body);
    expect(body.name).toBe("Fundraiser");
    expect(body.sizes).toEqual({ M: 4 });
    expect(body.roster).toEqual([]);
  });
});

describe("combineSizesAndRoster (the 'fill sizes from roster' math)", () => {
  it("adds one piece per roster row on top of the set's sizes", () => {
    expect(combineSizesAndRoster({ M: 3, L: 2 }, [{ size: "M" }, { size: "M" }, { size: "S" }])).toEqual({
      M: 5,
      L: 2,
      S: 1,
    });
  });

  it("skips sizes the garment doesn't come in", () => {
    expect(combineSizesAndRoster({ M: 2, OSFA: 5 }, [{ size: "OSFA" }, { size: "M" }], ["S", "M", "L"])).toEqual({
      M: 3,
    });
  });

  it("feeds sizesTotal for the list summary", () => {
    expect(sizesTotal(combineSizesAndRoster({ M: 3 }, [{ size: "L" }]))).toBe(4);
  });
});
