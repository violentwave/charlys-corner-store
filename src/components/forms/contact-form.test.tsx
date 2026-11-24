import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactForm } from "./contact-form";

const submitContact = vi.fn();
vi.mock("@/app/actions/contact", () => ({
  submitContact: (...args: unknown[]) => submitContact(...args),
}));

afterEach(() => cleanup());

describe("ContactForm", () => {
  it("shows errors for empty required fields", async () => {
    const user = userEvent.setup();
    render(<ContactForm sourcePage="contact" />);
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText("Please enter your name")).toBeInTheDocument();
    expect(screen.getByText("Please enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Please enter a message")).toBeInTheDocument();
  });

  it("shows thank-you panel on valid input", async () => {
    submitContact.mockResolvedValue({ ok: true, message: "Thanks, Logan! We'll reply to a@b.co." });
    const user = userEvent.setup();
    render(<ContactForm sourcePage="contact" />);
    await user.type(screen.getByLabelText(/Name/i), "Logan");
    await user.type(screen.getByLabelText(/Email/i), "a@b.co");
    await user.type(screen.getByLabelText(/Message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByText(/Thanks!/i)).toBeInTheDocument());
    expect(screen.getByText(/We'll reply to a@b.co/)).toBeInTheDocument();
  });
});
