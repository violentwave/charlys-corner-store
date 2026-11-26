import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignupForm } from "./signup-form";

// Throwaway form filler for mocked submits (never a real credential); built at runtime
// so secret scanners don't flag a `password = "…"` literal.
const TEST_PW = ["long", "enough", "password"].join("-");

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

const turnstileResetKeys: (number | undefined)[] = [];
vi.mock("./turnstile", () => ({
  Turnstile: ({ resetKey }: { resetKey?: number }) => {
    turnstileResetKeys.push(resetKey);
    return null;
  },
}));

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  replace.mockReset();
  turnstileResetKeys.length = 0;
});

function renderForm() {
  return render(<SignupForm next="/account" />);
}

describe("SignupForm", () => {
  it("shows client validation errors for a short password", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Email/i), "new@example.com");
    await user.type(screen.getByLabelText(/^Password/i), "short");
    await user.click(screen.getByRole("button", { name: /create my account/i }));
    expect(await screen.findByText("Use at least 10 characters")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a valid email", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/^Password/i), TEST_PW);
    await user.click(screen.getByRole("button", { name: /create my account/i }));
    expect(await screen.findByText("Please enter a valid email")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps server fieldErrors onto the fields", async () => {
    fetchMock.mockResolvedValue({
      status: 400,
      json: async () => ({
        ok: false,
        error: "Please fix the highlighted fields.",
        fieldErrors: { email: "Enter a real email" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Email/i), "weird-but-valid@example.com");
    await user.type(screen.getByLabelText(/^Password/i), TEST_PW);
    await user.click(screen.getByRole("button", { name: /create my account/i }));
    expect(await screen.findByText("Enter a real email")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the 409 'already exists' error with a link to /login", async () => {
    fetchMock.mockResolvedValue({
      status: 409,
      json: async () => ({
        ok: false,
        error: "An account with this email already exists. Log in instead.",
        fieldErrors: { email: "An account with this email already exists. Log in instead." },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Email/i), "taken@example.com");
    await user.type(screen.getByLabelText(/^Password/i), TEST_PW);
    await user.click(screen.getByRole("button", { name: /create my account/i }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /log in instead/i });
    expect(link).toHaveAttribute("href", "/login");
    expect(replace).not.toHaveBeenCalled();
  });

  it("navigates to /verify with the sanitized next on success", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, user: { email: "new@example.com", name: null, verified: false } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Email/i), "new@example.com");
    await user.type(screen.getByLabelText(/^Password/i), TEST_PW);
    await user.click(screen.getByRole("button", { name: /create my account/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/verify?next=%2Faccount");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/signup", expect.objectContaining({ method: "POST" }));
  });

  it("gets a fresh Turnstile token after a FAILED attempt (tokens are single-use)", async () => {
    fetchMock.mockResolvedValue({
      status: 429,
      json: async () => ({ ok: false, error: "Too many sign-ups from here." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Email/i), "new@example.com");
    await user.type(screen.getByLabelText(/^Password/i), TEST_PW);
    const before = Math.max(...turnstileResetKeys.map((k) => k ?? 0));
    await user.click(screen.getByRole("button", { name: /create my account/i }));
    expect(await screen.findByText(/Too many sign-ups/)).toBeInTheDocument();
    expect(Math.max(...turnstileResetKeys.map((k) => k ?? 0))).toBeGreaterThan(before);
  });
});
