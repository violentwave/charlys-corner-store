import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * The step-3 tool tabs exist below lg only (the mobile-360 project); desktop keeps the
 * one-panel inspector, so opening a tab is a no-op there. On mobile the tabs live in the
 * fixed tool shell (canvas on top, action bar at the bottom), so they're always clickable.
 */
export async function openToolTab(page: Page, tab: "item" | "add" | "side" | "layers") {
  if (test.info().project.name !== "mobile-360") return;
  await page.getByTestId(`tool-tab-${tab}`).click();
  await expect(page.getByTestId(`tool-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
}

export async function expectTab(page: Page, tab: "item" | "add" | "side" | "layers") {
  if (test.info().project.name !== "mobile-360") return;
  await expect(page.getByTestId(`tool-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
}
