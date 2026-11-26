import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountUser } from "@/lib/auth-schema";

import { SignInDialog } from "./sign-in-dialog";
import { uploadGateFor } from "./upload-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));
// The real widget loads Cloudflare's script; the forms only need a token.
vi.mock("@/components/forms/turnstile", () => ({
  Turnstile: ({ onToken }: { onToken: (t: string | null) => void }) => {
    queueMicrotask(() => onToken("test-token"));
    return null;
  },
}));

const fetchMock = vi.fn();
const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  replace.mockReset();
});

const verified: AccountUser = { email: "pup@example.com", name: "Pup", verified: true };
const unverified: AccountUser = { email: "pup@example.com", name: "Pup", verified: false };

const renderDialog = (props: Partial<Parameters<typeof SignInDialog>[0]> = {}) => {
  const handlers = { onClose: vi.fn(), onAccount: vi.fn(), onContinue: vi.fn() };
  render(<SignInDialog mode="signedOut" {...handlers} {...props} />);
  return handlers;
};

describe("uploadGateFor (the step-3 account gate)", () => {
  it("signed out and unverified visitors are gated; verified ones may upload", () => {
    expect(uploadGateFor(null)).toBe("signedOut");
    expect(uploadGateFor(unverified)).toBe("unverified");
    expect(uploadGateFor(verified)).toBe("allowed");
  });
});

describe("SignInDialog (sign up, verify and continue without leaving the builder)", () => {
  it("sign up → code → 'Add my design', never navigating away", async () => {
    vi.stubGlobal("fetch", fetchMock);
    // The Google button probes /api/auth/me on mount (Google: off in tests) — effects
    // flush inside render, so the response must be queued before rendering.
    respond(200, { user: null, providers: { google: false } });
    const user = userEvent.setup();
    const h = renderDialog();

    expect(screen.getByRole("tab", { name: "New here" })).toHaveAttribute("aria-selected", "true");
    await user.type(screen.getByLabelText(/Email/i), "pup@example.com");
    await user.type(screen.getByLabelText(/^Password/i), "correct horse battery");
    respond(200, { ok: true, user: unverified });
    await user.click(screen.getByRole("button", { name: /create my account/i }));

    expect(await screen.findByText(/Check your email/i)).toBeInTheDocument();
    expect(h.onAccount).toHaveBeenCalledWith(unverified);
    expect(screen.getByTestId("verify-email-note")).toHaveTextContent("pup@example.com");

    await user.type(screen.getByRole("textbox"), "123456");
    respond(200, { ok: true });
    await user.click(screen.getByRole("button", { name: /verify my email/i }));

    await user.click(await screen.findByTestId("dialog-add-design"));
    expect(h.onContinue).toHaveBeenCalled();
    expect(h.onAccount).toHaveBeenLastCalledWith(expect.objectContaining({ verified: true }));
    expect(replace).not.toHaveBeenCalled();
  });

  it("log in with a verified account goes straight to 'Add my design'", async () => {
    vi.stubGlobal("fetch", fetchMock);
    // Two Google probes: the signup form's on mount, the login form's when it mounts.
    respond(200, { user: null, providers: { google: false } });
    respond(200, { user: null, providers: { google: false } });
    const user = userEvent.setup();
    const h = renderDialog();
    await user.click(screen.getByRole("tab", { name: "I have an account" }));
    await user.type(screen.getByLabelText(/Email/i), "pup@example.com");
    await user.type(screen.getByLabelText(/^Password/i), "correct horse battery");
    respond(200, { ok: true, user: verified });
    await user.click(screen.getByRole("button", { name: /^log in$/i }));
    await waitFor(() => expect(screen.getByTestId("dialog-add-design")).toBeInTheDocument());
    expect(h.onAccount).toHaveBeenCalledWith(verified);
    expect(replace).not.toHaveBeenCalled();
  });

  it("an unverified account opens on the code step", () => {
    renderDialog({ mode: "unverified", email: "pup@example.com" });
    expect(screen.getByText(/Check your email/i)).toBeInTheDocument();
    expect(screen.getByTestId("verify-email-note")).toHaveTextContent("pup@example.com");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("closed: renders nothing", () => {
    renderDialog({ mode: null });
    expect(screen.queryByTestId("sign-in-dialog")).toBeNull();
  });
});
