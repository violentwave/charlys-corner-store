/**
 * Print methods + the Performance tees (2026-11-26): every method is listed, the ones that
 * don't fit the garment/color are disabled with a reason, and a pick that stops fitting
 * (darker color) falls back to "recommend".
 */
import { expect, test } from "@playwright/test";

test("performance tee: sublimation fits white, not navy; DTG never fits polyester", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("garment-perftee").click();
  await page.getByTestId("garment-continue").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("add-text").click();

  await page.getByTestId("print-method").click();
  await expect(page.getByTestId("print-method-dtg")).toHaveAttribute("data-disabled", "");
  await expect(page.getByTestId("print-method-dtg")).toContainText("needs cotton");
  await page.getByTestId("print-method-sublimation").click();
  await expect(page.getByTestId("print-method")).toContainText("Sublimation");
  await expect(page.getByTestId("print-method-help")).toContainText("polyester");

  // Navy: sublimation no longer fits, so the side falls back to the shop's recommendation.
  await page.getByRole("button", { name: "Step 2: Colors" }).click();
  await page.getByRole("group", { name: "Shirt color" }).getByRole("button", { name: "Navy", exact: true }).click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("print-method")).toContainText("Recommend one for me");
  await page.getByTestId("print-method").click();
  await expect(page.getByTestId("print-method-sublimation")).toContainText("light shirt color");
});
