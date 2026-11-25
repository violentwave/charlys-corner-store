import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountUser } from "@/lib/auth-schema";

import { SignInDialog } from "./sign-in-dialog";
import { uploadGateFor } from "./upload-gate";

afterEach(() => cleanup());

const verified: AccountUser = { email: "pup@example.com", name: "Pup", verified: true };
const unverified: AccountUser = { email: "pup@example.com", name: "Pup", verified: false };

describe("uploadGateFor (the step-3 account gate)", () => {
  it("signed out and unverified visitors are gated; verified ones may upload", () => {
    expect(uploadGateFor(null)).toBe("signedOut");
    expect(uploadGateFor(unverified)).toBe("unverified");
    expect(uploadGateFor(verified)).toBe("allowed");
  });
});

describe("SignInDialog", () => {
  it("signed out: explains why and links to /signup and /login with next back to the builder", async () => {
    window.history.pushState({}, "", "/design");
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SignInDialog mode="signedOut" onClose={onClose} />);

    expect(screen.getByText(/Create a free account to add your design/i)).toBeInTheDocument();
    expect(screen.getByText(/Your designs are saved/i)).toBeInTheDocument();
    expect(screen.getByText(/15% off your 2nd order/i)).toBeInTheDocument();

    const signup = screen.getByTestId("dialog-signup");
    expect(signup).toHaveAttribute("href", "/signup?next=%2Fdesign");
    expect(screen.getByTestId("dialog-login")).toHaveAttribute("href", "/login?next=%2Fdesign");

    await user.click(screen.getByLabelText("Close dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("unverified: sends the visitor to /verify with next back to the builder", () => {
    window.history.pushState({}, "", "/design");
    render(<SignInDialog mode="unverified" onClose={vi.fn()} />);
    expect(screen.getByText(/Confirm your email to add your design/i)).toBeInTheDocument();
    expect(screen.getByTestId("dialog-verify")).toHaveAttribute("href", "/verify?next=%2Fdesign");
    expect(screen.queryByTestId("dialog-signup")).toBeNull();
  });

  it("closed: renders nothing", () => {
    render(<SignInDialog mode={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId("sign-in-dialog")).toBeNull();
  });
});
