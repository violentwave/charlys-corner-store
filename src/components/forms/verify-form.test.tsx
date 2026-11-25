import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VerifyForm } from "./verify-form";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh }),
}));

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe("VerifyForm", () => {
  it("tells the visitor which email the code went to", () => {
    render(<VerifyForm next="/account" email="pup@example.com" />);
    const note = screen.getByTestId("verify-email-note");
    expect(note).toHaveTextContent("We emailed a 6-digit code to");
    expect(note).toHaveTextContent("pup@example.com");
  });

  it("rejects codes that aren't 6 digits", async () => {
    const user = userEvent.setup();
    render(<VerifyForm next="/account" email="pup@example.com" />);
    await user.type(screen.getByLabelText(/Verification code/i), "12ab");
    await user.click(screen.getByRole("button", { name: /verify my email/i }));
    expect(await screen.findByText("Enter the 6-digit code from your email")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes codes typed with spaces down to digits (paste-friendly)", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<VerifyForm next="/account" email="pup@example.com" />);
    const input = screen.getByLabelText(/Verification code/i);
    await user.type(input, "1 2 3 4 5 6");
    await user.click(screen.getByRole("button", { name: /verify my email/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(input).toHaveValue("123456");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/verify", expect.objectContaining({ method: "POST" }));
  });

  it("maps a wrong-code fieldError onto the code field", async () => {
    fetchMock.mockResolvedValue({
      status: 400,
      json: async () => ({
        ok: false,
        error: "That code isn't right. Check the email and try again.",
        fieldErrors: { code: "That code isn't right. Check the email and try again." },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<VerifyForm next="/account" email="pup@example.com" />);
    await user.type(screen.getByLabelText(/Verification code/i), "999999");
    await user.click(screen.getByRole("button", { name: /verify my email/i }));
    expect(await screen.findByText(/That code isn't right/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("disables 'Send a new code' for 30s after a successful send", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<VerifyForm next="/account" email="pup@example.com" />);
    await user.click(screen.getByTestId("resend-code"));
    const note = await screen.findByTestId("resent-note");
    expect(note).toHaveTextContent(/Fresh code sent to pup@example.com/);
    expect(screen.getByTestId("resend-code")).toBeDisabled();
    expect(screen.getByTestId("resend-code")).toHaveTextContent(/\(30s\)/);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/resend", expect.objectContaining({ method: "POST" }));
  });

  it("shows a resend failure instead of starting the cooldown", async () => {
    fetchMock.mockResolvedValue({
      status: 429,
      json: async () => ({
        ok: false,
        error: "We've sent a few codes already. Please check your inbox (and spam) or try later.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<VerifyForm next="/account" email="pup@example.com" />);
    await user.click(screen.getByTestId("resend-code"));
    expect(await screen.findByText(/a few codes already/i)).toBeInTheDocument();
    expect(screen.getByTestId("resend-code")).toBeEnabled();
  });
});
