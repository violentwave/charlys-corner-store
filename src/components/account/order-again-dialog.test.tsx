import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderAgainDialog } from "./order-again-dialog";
import type { AccountMockup } from "@/app/api/account/mockups/route";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const order: AccountMockup = {
  id: "o1",
  kind: "order",
  garmentName: "T-Shirt",
  createdAt: new Date().toISOString(),
  status: "ordered",
  colors: [{ label: "Shirt", name: "Navy", hex: "#1a2a4a" }],
  sizes: ["2 × M"],
  views: [{ view: "front", area: "Full Front", imageUrl: null, downloadUrl: null }],
  filesExpired: false,
  filesExpireAt: null,
  removal: "hide",
  restorePath: "/?mockup=o1",
  orderStage: null,
  order: null,
  canResend: false,
  canReorder: true,
};

function setup() {
  const onOrdered = vi.fn();
  const onClose = vi.fn();
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes("/reorder")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, sizeSets: [] }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<OrderAgainDialog item={order} onClose={onClose} onOrdered={onOrdered} />);
  return { onOrdered, onClose };
}

describe("OrderAgainDialog", () => {
  it("shows the garment's size grid and, when saved sets exist, the Use saved sizes select", async () => {
    // With no saved sets, no select.
    setup();
    await screen.findByTestId("order-again-dialog");
    expect(screen.getByLabelText(/M$/i)).toBeVisible(); // the T-Shirt grid
    expect(screen.queryByTestId("order-again-sets")).toBeNull();
  });

  it("requires at least one piece (client rule matches the server)", async () => {
    const user = userEvent.setup();
    const { onOrdered } = setup();
    await screen.findByTestId("order-again-dialog");
    await user.click(screen.getByTestId("order-again-submit"));
    expect(await screen.findByTestId("order-again-error")).toHaveTextContent(/Add at least one size/i);
    expect(onOrdered).not.toHaveBeenCalled();
  });

  it("submits sizes (zeros dropped) + notes and shows the sent state", async () => {
    const user = userEvent.setup();
    const { onOrdered, onClose } = setup();
    await screen.findByTestId("order-again-dialog");
    await user.type(screen.getByLabelText(/M$/i), "2");
    await user.type(screen.getByTestId("order-again-notes"), "Same print as last time");
    await user.click(screen.getByTestId("order-again-submit"));

    await screen.findByTestId("order-again-sent");
    const reorder = fetchMock.mock.calls.find(([url]) => String(url).includes("/reorder"))!;
    const body = JSON.parse(reorder[1].body);
    expect(body.sizes).toEqual({ M: 2 });
    expect(body.notes).toBe("Same print as last time");

    await user.click(screen.getByTestId("order-again-close"));
    expect(onOrdered).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
