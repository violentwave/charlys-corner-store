import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "./reset-password-form";

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

const TOKEN = "a".repeat(43);

describe("ResetPasswordForm", () => {
  it("flags a short password with the shared rule message", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token={TOKEN} />);
    await user.type(screen.getByLabelText(/^New password/i), "short");
    await user.type(screen.getByLabelText(/Confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /save my new password/i }));
    expect(await screen.findByText("Use at least 10 characters")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the confirm field client-side", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token={TOKEN} />);
    await user.type(screen.getByLabelText(/^New password/i), "long-enough-password");
    await user.type(screen.getByLabelText(/Confirm new password/i), "long-enough-passphrase");
    await user.click(screen.getByRole("button", { name: /save my new password/i }));
    expect(await screen.findByText("The passwords don't match")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the token and lands on /account on success", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ResetPasswordForm token={TOKEN} />);
    await user.type(screen.getByLabelText(/^New password/i), "long-enough-password");
    await user.type(screen.getByLabelText(/Confirm new password/i), "long-enough-password");
    await user.click(screen.getByRole("button", { name: /save my new password/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/reset",
      expect.objectContaining({ body: JSON.stringify({ token: TOKEN, password: "long-enough-password" }) }),
    );
  });

  it("shows the expired-token message and a way to request a new link", async () => {
    fetchMock.mockResolvedValue({
      status: 400,
      json: async () => ({ ok: false, error: "This reset link has expired or was already used. Request a new one." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ResetPasswordForm token={TOKEN} />);
    await user.type(screen.getByLabelText(/^New password/i), "long-enough-password");
    await user.type(screen.getByLabelText(/Confirm new password/i), "long-enough-password");
    await user.click(screen.getByRole("button", { name: /save my new password/i }));
    expect(await screen.findByText(/expired or was already used/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a fresh reset link/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("surfaces a token fieldError (bad link) in the alert, where the visitor can see it", async () => {
    fetchMock.mockResolvedValue({
      status: 400,
      json: async () => ({
        ok: false,
        error: "Please fix the highlighted fields.",
        fieldErrors: { token: "This reset link is not valid" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ResetPasswordForm token="not-a-token" />);
    await user.type(screen.getByLabelText(/^New password/i), "long-enough-password");
    await user.type(screen.getByLabelText(/Confirm new password/i), "long-enough-password");
    await user.click(screen.getByRole("button", { name: /save my new password/i }));
    expect(await screen.findByText("This reset link is not valid")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
