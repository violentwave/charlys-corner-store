import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GateStep } from "./gate-step";

const turnstileResetKeys: (number | undefined)[] = [];
vi.mock("@/components/forms/turnstile", () => ({
  Turnstile: ({ resetKey }: { resetKey?: number }) => {
    turnstileResetKeys.push(resetKey);
    return null;
  },
}));

afterEach(() => cleanup());

const base = {
  garmentName: "T-Shirt",
  hasArtwork: true,
  sending: false,
  progress: "",
  error: null as string | null,
  fieldErrors: null as Record<string, string> | null,
  turnstileToken: "tok",
  onTurnstileToken: vi.fn(),
  turnstileResetKey: 0,
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onQuote: vi.fn().mockResolvedValue(undefined),
};

describe("GateStep (builder email gate)", () => {
  it("requires an email", async () => {
    const user = userEvent.setup();
    render(<GateStep {...base} />);
    await user.click(screen.getByTestId("gate-submit"));
    expect(await screen.findByText("Please enter a valid email")).toBeInTheDocument();
    expect(base.onSubmit).not.toHaveBeenCalled();
  });

  it("starts the marketing opt-in unchecked and reports it on submit", async () => {
    const user = userEvent.setup();
    render(<GateStep {...base} />);
    const checkbox = screen.getByTestId("gate-optin");
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    await user.type(screen.getByTestId("gate-email"), "charly@example.com");
    await user.click(screen.getByTestId("gate-optin"));
    await user.click(screen.getByTestId("gate-submit"));
    await waitFor(() => expect(base.onSubmit).toHaveBeenCalled());
    expect(base.onSubmit.mock.calls[0]![0].marketingOptIn).toBe(true);
  });

  it("disables the buttons while sending", () => {
    render(<GateStep {...base} sending progress="Uploading your mockup…" />);
    expect(screen.getByTestId("gate-submit")).toBeDisabled();
    expect(screen.getByTestId("gate-quote")).toBeDisabled();
    expect(screen.getByTestId("gate-progress")).toHaveTextContent("Uploading your mockup…");
  });

  it("blocks submission with a clear message when no artwork is placed", () => {
    render(<GateStep {...base} hasArtwork={false} />);
    expect(screen.getByTestId("gate-blocked")).toHaveTextContent(/Add your design first/i);
    expect(screen.getByTestId("gate-submit")).toBeDisabled();
    expect(screen.getByTestId("gate-quote")).toBeDisabled();
  });

  it("maps server fieldErrors back onto the fields", async () => {
    const { rerender } = render(<GateStep {...base} />);
    rerender(<GateStep {...base} fieldErrors={{ email: "That email is already taken" }} />);
    expect(await screen.findByText("That email is already taken")).toBeInTheDocument();
  });

  it("routes the secondary button to onQuote", async () => {
    const user = userEvent.setup();
    render(<GateStep {...base} />);
    await user.type(screen.getByTestId("gate-email"), "charly@example.com");
    await user.click(screen.getByTestId("gate-quote"));
    await waitFor(() => expect(base.onQuote).toHaveBeenCalled());
    expect(base.onSubmit).not.toHaveBeenCalled();
  });
});
