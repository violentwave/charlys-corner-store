import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountMockup } from "@/app/api/account/mockups/route";

import { MyDesigns } from "./my-designs";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

const orderItem = (id: string): AccountMockup => ({
  id,
  kind: "order",
  garmentName: id.endsWith("1") ? "Gildan 5000 Heavy Cotton Tee" : "Gildan 18500 Hoodie",
  createdAt: new Date().toISOString(),
  status: "received",
  colors: [{ label: "Shirt", name: "Black", hex: "#000000" }],
  sizes: ["2 × M"],
  views: [{ view: "Front", area: "Full Front", imageUrl: null, downloadUrl: null }],
  filesExpired: false,
  filesExpireAt: null,
  removal: "hide",
  orderStage: { stage: "received", label: "Received", description: "We have it.", updatedAt: null },
  order: {
    id: "abcd1234-0000-4000-8000-000000000000",
    itemCount: 2,
    quoteCents: 4500,
    paidAt: null,
    payPath: "/pay/abcd1234-0000-4000-8000-000000000000",
  },
  canResend: false,
  canReorder: true,
  restorePath: `/design?mockup=${id}`,
});

describe("My designs: order grouping", () => {
  it("shows two designs of one order as a single order card with the price and Pay now", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/account/mockups")
        return Promise.resolve(json({ ok: true, items: [orderItem("1"), orderItem("2")] }));
      if (url === "/api/account/wallet") return Promise.resolve(json({ ok: true, coupon: null }));
      return Promise.resolve(json({ ok: false, error: "unexpected" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyDesigns email="pup@example.com" />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: /order requests/i }));

    const cards = await screen.findAllByTestId("order-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Order #abcd1234 · 2 designs");
    expect(screen.getAllByTestId("order-design")).toHaveLength(2);
    expect(screen.getByTestId("order-price")).toHaveTextContent("$45.00");
    expect(screen.getByTestId("order-pay")).toHaveAttribute("href", "/pay/abcd1234-0000-4000-8000-000000000000");
  });
});
