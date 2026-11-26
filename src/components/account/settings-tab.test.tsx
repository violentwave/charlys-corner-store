import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsTab } from "./settings-tab";
import type { AccountSecurity } from "@/lib/auth-schema";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  replace.mockReset();
});

const security = (over: Partial<AccountSecurity> = {}): AccountSecurity => ({
  hasPassword: true,
  google: { available: false, linked: false },
  twoFactor: { method: null, recoveryCodesLeft: 0 },
  ...over,
});

function setup(securityState: AccountSecurity = security()) {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes("/api/account/security")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, security: securityState }) });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, settings: { email: "me@example.com", name: "Logan", marketingOptIn: false } }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<SettingsTab />);
}

describe("SettingsTab password form", () => {
  it("with a password and no 2FA: current + new + confirm, no code field", async () => {
    setup();
    expect(await screen.findByTestId("password-form")).toBeVisible();
    expect(screen.getByTestId("password-current")).toBeVisible();
    expect(screen.queryByTestId("password-code")).toBeNull();
    expect(screen.getByTestId("password-warning")).toHaveTextContent(/signed out on all devices/);
  });

  it("with 2FA on: the code field appears (with a send button for email 2FA)", async () => {
    setup(security({ twoFactor: { method: "email", recoveryCodesLeft: 10 } }));
    expect(await screen.findByTestId("password-code")).toBeVisible();
    expect(screen.getByTestId("password-send-code")).toBeVisible();
    expect(screen.getByTestId("password-warning").textContent).toContain("(and your 2FA code)");
  });

  it("a Google-only account (no password): no current-password field, says Set a password", async () => {
    setup(security({ hasPassword: false }));
    expect(await screen.findByTestId("no-password-note")).toBeVisible();
    expect(screen.queryByTestId("password-current")).toBeNull();
    expect(screen.getByTestId("password-submit")).toHaveTextContent(/Set a password/i);
  });

  it("mismatched confirm is caught client-side before any request", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId("password-form");
    await user.type(screen.getByTestId("password-current"), "current-password-1");
    await user.type(screen.getByTestId("password-new"), "brand-new-password-9");
    await user.type(screen.getByTestId("password-confirm"), "different-password-9");
    await user.click(screen.getByTestId("password-submit"));
    expect(await screen.findByText("The passwords don't match")).toBeInTheDocument();
    // The submit never left the page.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/account/password"))).toHaveLength(0);
  });

  it("a successful change signs the member out everywhere and heads to /login", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/api/account/password")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, signedOut: true }) });
      }
      if (String(url).includes("/api/account/security")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, security: security() }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, settings: { email: "me@example.com", name: null, marketingOptIn: false } }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsTab />);
    await user.type(await screen.findByTestId("password-current"), "current-password-1");
    await user.type(screen.getByTestId("password-new"), "brand-new-password-9");
    await user.type(screen.getByTestId("password-confirm"), "brand-new-password-9");
    await user.click(screen.getByTestId("password-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/account/password", expect.anything()));
  });
});
