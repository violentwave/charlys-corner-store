import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountUser } from "@/lib/auth-schema";
import { TwoFactorForm } from "./two-factor-form";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh }),
}));

const fetchMock = vi.fn();
const dispatched: Event[] = [];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  replace.mockReset();
  refresh.mockReset();
  dispatched.length = 0;
  vi.restoreAllMocks();
});

function setup(challenge: { method: "totp" | "email"; emailSent: boolean }, onDone?: (user: AccountUser) => void) {
  const user = userEvent.setup();
  render(<TwoFactorForm challenge={challenge} next="/account" onDone={onDone} />);
  return user;
}

describe("TwoFactorForm", () => {
  it("app method: asks for the authenticator code, with the right input attributes", () => {
    setup({ method: "totp", emailSent: false });
    expect(screen.getByText(/Enter the 6-digit code from your authenticator app/i)).toBeInTheDocument();
    const input = screen.getByTestId("twofactor-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "6");
    expect(screen.queryByTestId("twofactor-resend")).toBeNull(); // nothing to resend for apps
  });

  it("email method: says the code was emailed and offers Send a new code", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = setup({ method: "email", emailSent: true });
    expect(screen.getByText(/We emailed you a 6-digit code/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("twofactor-resend"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/2fa/resend", expect.objectContaining({ method: "POST" })),
    );
  });

  it("the backup-code toggle swaps the field to XXXX-XXXX and back", async () => {
    const user = setup({ method: "totp", emailSent: false });
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("twofactor-backup-toggle"));
    expect(screen.getByLabelText(/Backup code/i)).toBeInTheDocument();
    expect(screen.getByTestId("twofactor-code")).toHaveAttribute("placeholder", "XXXX-XXXX");
    expect(screen.getByTestId("twofactor-code")).toHaveAttribute("maxlength", "9");
    await user.click(screen.getByTestId("twofactor-backup-toggle"));
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
  });

  it("a code verifies, announces the session and finishes to next", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, user: { email: "me@example.com", name: null, verified: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(window, "dispatchEvent");
    const user = setup({ method: "totp", emailSent: false });
    await user.type(screen.getByTestId("twofactor-code"), "123456");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(refresh).toHaveBeenCalled();
    expect(spy.mock.calls.some(([event]) => event.type === "charly:auth-changed")).toBe(true);
  });

  it("a spent backup code with 3 or fewer left nudges to Security", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        ok: true,
        user: { email: "me@example.com", name: null, verified: true },
        usedBackupCode: true,
        backupCodesLeft: 2,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const toastSpy = vi.spyOn(window, "dispatchEvent");
    const user = setup({ method: "totp", emailSent: false });
    await user.click(screen.getByTestId("twofactor-backup-toggle"));
    await user.type(screen.getByTestId("twofactor-code"), "ABCD-EFGH");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    // The toast flows through the window event the Toaster listens for.
    expect(toastSpy.mock.calls.some(([event]) => event.type === "charly-toast")).toBe(true);
  });

  it("a wrong code lands on the code field, not just the alert", async () => {
    fetchMock.mockResolvedValue({
      status: 400,
      json: async () => ({
        ok: false,
        error: "That code isn't right. Try again, or use a backup code.",
        fieldErrors: { code: "That code isn't right. Try again, or use a backup code." },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = setup({ method: "totp", emailSent: false });
    await user.type(screen.getByTestId("twofactor-code"), "000000");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));
    await waitFor(() => expect(screen.getByText(/That code isn't right/i)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });
});
