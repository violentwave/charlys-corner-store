import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CartItemView } from "@/lib/cart";

import { CartView } from "./cart-view";

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

const item = (overrides: Partial<CartItemView> & Pick<CartItemView, "id" | "garmentName">): CartItemView => ({
  garment: "tshirt",
  colors: [{ label: "Shirt", name: "White", hex: "#ffffff" }],
  views: [{ view: "Front", area: "Full Front", method: "Screen print", imageUrl: null }],
  sizes: { M: 2 },
  sizeOptions: ["S", "M", "L"],
  pieces: 2,
  notes: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const tee = item({ id: "11111111-1111-4111-8111-111111111111", garmentName: "Gildan 5000 Heavy Cotton Tee" });
const hoodie = item({
  id: "22222222-2222-4222-8222-222222222222",
  garmentName: "Gildan 18500 Hoodie",
  garment: "hoodie",
  sizes: {},
  pieces: 0,
});

describe("CartView", () => {
  it("disables Send while the request is in flight, then shows the confirmation", async () => {
    let resolveSubmit!: (value: unknown) => void;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/cart" && !init?.method) {
        return Promise.resolve(json({ ok: true, items: [tee, hoodie], max: 20, pieces: 2 }));
      }
      if (url === "/api/cart/submit") {
        return new Promise((resolve) => {
          resolveSubmit = resolve;
        });
      }
      return Promise.resolve(json({ ok: false, error: "unexpected" }, 500));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CartView />);

    await screen.findAllByTestId("cart-item");
    const submit = screen.getByTestId("cart-submit");
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      resolveSubmit(json({ ok: true, orderId: "order-1", itemCount: 2 }));
    });
    expect(await screen.findByTestId("cart-sent")).toHaveTextContent(/Order request sent!/i);
  });

  it("maps the server's fieldErrors back onto the right card", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/cart" && !init?.method) {
        return Promise.resolve(json({ ok: true, items: [tee, hoodie], max: 20, pieces: 2 }));
      }
      if (url === "/api/cart/submit") {
        return Promise.resolve(
          json(
            {
              ok: false,
              error: "Add sizes and quantities to every item before sending.",
              fieldErrors: { [hoodie.id]: "Add at least one size" },
            },
            400,
          ),
        );
      }
      return Promise.resolve(json({ ok: false, error: "unexpected" }, 500));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CartView />);

    const cards = await screen.findAllByTestId("cart-item");
    fireEvent.click(screen.getByTestId("cart-submit"));

    expect(await screen.findByTestId("cart-submit-error")).toHaveTextContent(/Add sizes and quantities/i);
    const hoodieCard = cards.find((card) => card.textContent?.includes("Hoodie"))!;
    const teeCard = cards.find((card) => card.textContent?.includes("Heavy Cotton"))!;
    expect(within(hoodieCard).getByTestId("cart-item-error")).toHaveTextContent("Add at least one size");
    expect(within(teeCard).queryByTestId("cart-item-error")).toBeNull();
  });

  it("shows the friendly empty state", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ ok: true, items: [], max: 20, pieces: 0 })));
    vi.stubGlobal("fetch", fetchMock);
    render(<CartView />);
    expect(await screen.findByTestId("cart-empty")).toHaveTextContent(/Your cart is empty/i);
    expect(screen.getByRole("link", { name: "Design something" })).toHaveAttribute("href", "/#design");
  });
});
