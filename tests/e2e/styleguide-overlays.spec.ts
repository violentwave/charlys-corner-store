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
