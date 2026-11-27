import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CartItemView } from "@/lib/cart";

import { CartItemCard } from "./cart-item-card";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const item: CartItemView = {
  id: "11111111-1111-4111-8111-111111111111",
  garment: "tshirt",
  garmentName: "Gildan 5000 Heavy Cotton Tee",
  colors: [{ label: "Shirt", name: "White", hex: "#ffffff" }],
  views: [{ view: "Front", area: "Full Front", method: "Screen print", imageUrl: null }],
  sizes: {},
  sizeOptions: ["S", "M", "L"],
  pieces: 0,
  notes: null,
  createdAt: new Date().toISOString(),
};

function renderCard(overrides?: { onUpdated?: (next: CartItemView) => void }) {
  const onUpdated = overrides?.onUpdated ?? vi.fn();
  render(
    <CartItemCard item={item} onUpdated={onUpdated} onRemoved={vi.fn()} onFlushChange={vi.fn()} cardRef={vi.fn()} />,
  );
  return { onUpdated };
}

describe("CartItemCard", () => {
  it("saves the sizes grid on blur as a PATCH with zero rows dropped", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, item: { ...item, sizes: { M: 3 }, pieces: 3 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onUpdated } = renderCard();

    const input = screen.getByTestId(`cart-${item.id}-size-M`);
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/cart/${item.id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ sizes: { M: 3 } });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(await screen.findByTestId("cart-item-status")).toHaveTextContent("Saved");
  });

  it("shows the server's message when a save fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, error: "Too many changes — please try again in a bit." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    const input = screen.getByTestId(`cart-${item.id}-size-M`);
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByTestId("cart-item-status")).toHaveTextContent(/Too many changes/));
  });

  it("shows the submit-time error for this design and marks the card", () => {
    render(
      <CartItemCard
        item={item}
        error="Add at least one size"
        onUpdated={vi.fn()}
        onRemoved={vi.fn()}
        onFlushChange={vi.fn()}
        cardRef={vi.fn()}
      />,
    );
    expect(screen.getByTestId("cart-item-error")).toHaveTextContent("Add at least one size");
    expect(screen.getByTestId("cart-item")).toHaveAttribute("data-error", "true");
  });
});
