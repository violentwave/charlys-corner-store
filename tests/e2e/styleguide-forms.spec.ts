import { expect, test } from "@playwright/test";

test("Select opens with keyboard and selects an option", async ({ page }) => {
  await page.goto("/styleguide");
  const trigger = page.getByRole("combobox").first();
  await trigger.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText(/T-shirt|Baseball tee|Hoodie|Hat/);
});

test("choosing Other reveals the specify field", async ({ page }) => {
  await page.goto("/styleguide");
  const trigger = page.getByRole("combobox").nth(1);
  await trigger.click();
  await page.getByRole("option", { name: "Other" }).click();
  await expect(page.getByLabel(/If Other please specify/i)).toBeVisible();
});
