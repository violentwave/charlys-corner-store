import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Wallet } from "./wallet";
import type { WalletCoupon } from "@/app/api/account/wallet/route";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const coupon = (status: WalletCoupon["status"]): WalletCoupon => ({
  code: "CHARLY-ABCD-EFGH",
  percentOff: 15,
  minOrderCents: 3000,
  status,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
});

function renderWallet(coupon: WalletCoupon | null) {
  fetchMock.mockResolvedValue({ status: 200, json: async () => ({ ok: true, coupon }) });
  vi.stubGlobal("fetch", fetchMock);
  render(<Wallet />);
}

describe("Wallet", () => {
  it("renders nothing while loading or when there's no coupon", async () => {
    renderWallet(null);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("wallet")).toBeNull();
  });

  it("issued: the ticket plus 'Unlocks after your first order'", async () => {
    renderWallet(coupon("issued"));
    expect(await screen.findByTestId("wallet")).toBeVisible();
    expect(screen.getByText("CHARLY-ABCD-EFGH")).toBeInTheDocument(); // the ticket's code
    expect(screen.getByTestId("wallet-status")).toHaveTextContent("Unlocks after your first order");
  });

  it("eligible: 'Ready to use'", async () => {
    renderWallet(coupon("eligible"));
    expect(await screen.findByTestId("wallet-status")).toHaveTextContent("Ready to use");
  });

  it("redeemed and expired: honest statuses", async () => {
    renderWallet(coupon("redeemed"));
    expect(await screen.findByTestId("wallet-status")).toHaveTextContent("Used");
    cleanup();
    renderWallet(coupon("expired"));
    expect(await screen.findByTestId("wallet-status")).toHaveTextContent("Expired");
  });
});
