import { expect, test } from "@playwright/test";

test("dialog opens via keyboard, traps focus, and returns focus on Esc", async ({ page }) => {
  await page.goto("/styleguide");
  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Tab should stay inside the dialog
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
  expect(active).toBeTruthy();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("success toast appears with text and can be dismissed", async ({ page }) => {
  await page.goto("/styleguide");
  await page.getByRole("button", { name: "Success toast" }).click();
  const toastText = page.getByText("Saved", { exact: true });
  await expect(toastText).toBeVisible();
  await expect(page.getByText("Your changes are live.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /dismiss notification/i }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeHidden();
});

test("dialog is vertically centered on desktop", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 640, "desktop only");
  await page.goto("/styleguide");
  await page.getByRole("button", { name: "Open dialog" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300); // let the enter animation finish
  const box = (await dialog.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const center = box.y + box.height / 2;
  expect(Math.abs(center - vh / 2)).toBeLessThan(4);
});

test("toasts stay inside a 360px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/styleguide");
  await page.getByRole("button", { name: "Success toast" }).click();
  const toast = page.locator("li").filter({ hasText: "Your changes are live." }).first();
  await expect(toast).toBeVisible();
  const box = (await toast.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});
