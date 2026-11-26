import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrderStageTracker } from "./order-stage-tracker";
import type { AccountMockup } from "@/app/api/account/mockups/route";

afterEach(() => cleanup());

const stage = (stage: AccountMockup["orderStage"] extends null ? never : NonNullable<AccountMockup["orderStage"]>) =>
  stage;

describe("OrderStageTracker", () => {
  it("shows all five steps, marks the current with aria-current and 'Current' (not color-only)", () => {
    render(
      <OrderStageTracker
        stage={stage({
          stage: "in_production",
          label: "In production",
          description: "Your order is being printed.",
          updatedAt: "2026-11-26T10:00:00Z",
        })}
      />,
    );
    for (const step of ["received", "quoted", "in_production", "ready", "completed"]) {
      expect(screen.getByTestId(`stage-${step}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("stage-in_production")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("stage-current-in_production")).toHaveTextContent("Current");
    // Done steps announce themselves + get the check.
    expect(screen.getByTestId("stage-received").textContent).toContain("Received");
    expect(screen.getByTestId("stage-received").textContent).toContain("✓");
    // Future steps don't.
    expect(screen.getByTestId("stage-ready").textContent).not.toContain("Current");
  });

  it("later stages light up earlier ones", () => {
    render(
      <OrderStageTracker stage={stage({ stage: "ready", label: "Ready", description: "Ready!", updatedAt: null })} />,
    );
    expect(screen.getByTestId("stage-ready")).toHaveAttribute("aria-current", "step");
    for (const done of ["received", "quoted", "in_production"]) {
      expect(screen.getByTestId(`stage-${done}`).textContent).toContain("✓");
    }
  });

  it("cancelled collapses to one badge + the explanation", () => {
    render(
      <OrderStageTracker
        stage={stage({
          stage: "cancelled",
          label: "Cancelled",
          description: "This order was cancelled.",
          updatedAt: null,
        })}
      />,
    );
    expect(screen.queryByTestId("stage-list")).toBeNull();
    const root = screen.getByTestId("order-stage");
    expect(root).toHaveTextContent(/Cancelled/);
    expect(root).toHaveTextContent(/This order was cancelled\./);
  });
});
