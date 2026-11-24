import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactForm } from "./contact-form";

const notify = vi.fn();

afterEach(() => cleanup());
vi.mock("./form-notice", () => ({
  notifyFormsComingSoon: () => notify(),
}));

describe("ContactForm", () => {
  it("shows errors for empty required fields", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText("Please enter your name")).toBeInTheDocument();
    expect(screen.getByText("Please enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Please enter a message")).toBeInTheDocument();
  });

  it("calls notifyFormsComingSoon on valid input", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText(/Name/i), "Logan");
    await user.type(screen.getByLabelText(/Email/i), "a@b.co");
    await user.type(screen.getByLabelText(/Message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(notify).toHaveBeenCalled());
  });
});
