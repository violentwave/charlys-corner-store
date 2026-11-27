import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";
import { initialDesign } from "./use-builder-state";

import { SendStep } from "./send-step";

const tshirt = getGarment("tshirt");

afterEach(() => cleanup());

function renderSendStep(overrides?: {
  hasArtwork?: boolean;
  onSend?: (intent: "email" | "order", marketingOptIn: boolean) => void;
  sizes?: Record<string, number>;
}) {
  const onSend = overrides?.onSend ?? vi.fn();
  const design = initialDesign("tshirt");
  if (overrides?.sizes) design.sizes = overrides.sizes;
  render(
    <SendStep
      garment={tshirt}
      design={design}
      accountEmail="pup@example.com"
      hasArtwork={overrides?.hasArtwork ?? true}
      sending={false}
      progress={null}
      error={null}
      onSize={vi.fn()}
      onNotes={vi.fn()}
      onReferral={vi.fn()}
      onWebsite={vi.fn()}
      onSend={onSend}
    />,
  );
  return { onSend };
}

describe("SendStep (step 4: two paths)", () => {
  it("shows the two paths as separate cards with their copy and the account email", () => {
    renderSendStep();
    const emailPath = screen.getByTestId("path-email");
    expect(emailPath).toHaveTextContent("Email me this mockup");
    expect(emailPath).toHaveTextContent(/pup@example\.com/);
    expect(emailPath).toHaveTextContent(/15% off your next one/);

    const orderPath = screen.getByTestId("path-order");
    expect(orderPath).toHaveTextContent("Order this design");
    expect(orderPath).toHaveTextContent(/confirm the price and send you an invoice/i);
    expect(orderPath).toHaveTextContent(/Nothing is charged now/i);
    // Old-site parity: sizes and the referral question live in the order card...
    expect(orderPath).toHaveTextContent("Sizes and quantities");
    expect(screen.getByLabelText(/How did you hear about us\?/i)).toBeInTheDocument();
    // ...but the notes sit above both cards so they ride along with either path (P48-2).
    expect(screen.getByTestId("builder-notes")).toBeInTheDocument();
    expect(orderPath.contains(screen.getByTestId("builder-notes"))).toBe(false);
    expect(screen.getByTestId("builder-notes")).toHaveAccessibleDescription(/Anything we should know\?/i);
  });

  it("the email path sends intent 'email' and the marketing opt-in stays unchecked by default", async () => {
    const user = userEvent.setup();
    const { onSend } = renderSendStep();
    await user.click(screen.getByTestId("send-email"));
    expect(onSend).toHaveBeenCalledWith("email", false);
  });

  it("the opt-in checkbox travels with the email path", async () => {
    const user = userEvent.setup();
    const { onSend } = renderSendStep();
    await user.click(screen.getByTestId("send-optin"));
    await user.click(screen.getByTestId("send-email"));
    expect(onSend).toHaveBeenCalledWith("email", true);
  });

  it("the order path requires at least one total quantity (matches the server rule)", async () => {
    const user = userEvent.setup();
    const { onSend } = renderSendStep({ sizes: {} });
    await user.click(screen.getByTestId("send-order"));
    expect(screen.getByTestId("order-needs-quantity")).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("the order path sends intent 'order' once a size has a quantity", async () => {
    const user = userEvent.setup();
    const { onSend } = renderSendStep({ sizes: { L: 3 } });
    await user.click(screen.getByTestId("send-order"));
    expect(onSend).toHaveBeenCalledWith("order", false);
    expect(screen.queryByTestId("order-needs-quantity")).toBeNull();
  });

  it("both buttons are blocked (with an alert) until artwork is placed", () => {
    renderSendStep({ hasArtwork: false });
    expect(screen.getByTestId("send-blocked")).toBeInTheDocument();
    expect(screen.getByTestId("send-email")).toBeDisabled();
    expect(screen.getByTestId("send-order")).toBeDisabled();
  });

  it("carries the honeypot up to the builder", () => {
    const onWebsite = vi.fn();
    render(
      <SendStep
        garment={tshirt}
        design={initialDesign("tshirt")}
        accountEmail="pup@example.com"
        hasArtwork
        sending={false}
        progress={null}
        error={null}
        onSize={vi.fn()}
        onNotes={vi.fn()}
        onReferral={vi.fn()}
        onWebsite={onWebsite}
        onSend={vi.fn()}
      />,
    );
    fireEvent.change(document.querySelector("#builder-website")!, { target: { value: "http://spam.example" } });
    expect(onWebsite).toHaveBeenCalledWith("http://spam.example");
  });
});
