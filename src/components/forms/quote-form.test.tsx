import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuoteForm } from "./quote-form";

const notify = vi.fn();
vi.mock("./form-notice", () => ({
  notifyFormsComingSoon: () => notify(),
}));

afterEach(() => cleanup());

describe("QuoteForm", () => {
  it("shows required errors", async () => {
    const user = userEvent.setup();
    render(<QuoteForm />);
    await user.click(screen.getByRole("button", { name: /request quote/i }));
    expect(await screen.findByText("Please enter your name")).toBeInTheDocument();
    expect(screen.getByText("Tell us what you'd like made")).toBeInTheDocument();
  });

  it("rejects zero quantity", async () => {
    const user = userEvent.setup();
    render(<QuoteForm />);
    await user.type(screen.getByLabelText(/Name/i), "A");
    await user.type(screen.getByLabelText(/Email/i), "a@b.co");
    await user.type(screen.getByLabelText(/What do you need/i), "tees");
    await user.clear(screen.getByLabelText(/Quantity/i));
    await user.type(screen.getByLabelText(/Quantity/i), "0");
    await user.click(screen.getByRole("button", { name: /request quote/i }));
    expect(await screen.findByText("Quantity must be at least 1")).toBeInTheDocument();
  });

  it("calls notify on valid input", async () => {
    const user = userEvent.setup();
    render(<QuoteForm />);
    await user.type(screen.getByLabelText(/Name/i), "A");
    await user.type(screen.getByLabelText(/Email/i), "a@b.co");
    await user.type(screen.getByLabelText(/What do you need/i), "tees");
    await user.click(screen.getByRole("button", { name: /request quote/i }));
    await waitFor(() => expect(notify).toHaveBeenCalled());
  });
});
