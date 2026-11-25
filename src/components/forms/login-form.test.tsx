import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

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

function fillAndSubmit(email = "me@example.com", password = "whatever-password") {
  return async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/Email/i), email);
    await user.type(screen.getByLabelText(/Password/i), password);
    await user.click(screen.getByRole("button", { name: /^log in$/i }));
  };
}

describe("LoginForm", () => {
  it("requires email and password", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/account" />);
    await user.click(screen.getByRole("button", { name: /^log in$/i }));
    expect(await screen.findByText("Please enter a valid email")).toBeInTheDocument();
    expect(await screen.findByText("Enter your password")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the wrong-password error on the password field", async () => {
    fetchMock.mockResolvedValue({
      status: 401,
      json: async () => ({
        ok: false,
        error: "That email and password don't match.",
        fieldErrors: { password: "That email and password don't match." },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LoginForm next="/account" />);
    await fillAndSubmit()(user);
    const messages = await screen.findAllByText("That email and password don't match.");
    expect(messages.length).toBeGreaterThanOrEqual(1); // shown on the field and in the alert
    expect(replace).not.toHaveBeenCalled();
  });

  it("goes to /verify when the account isn't verified yet", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, user: { email: "me@example.com", name: null, verified: false } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LoginForm next="/account" />);
    await fillAndSubmit()(user);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/verify?next=%2Faccount"));
  });

  it("goes to next when the account is verified", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, user: { email: "me@example.com", name: "Logan", verified: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LoginForm next="/design" />);
    await fillAndSubmit()(user);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/design"));
  });
});
