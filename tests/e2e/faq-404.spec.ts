import { expect, test } from "@playwright/test";

test("faq opens an item via keyboard", async ({ page }) => {
  await page.goto("/faq");
  const summary = page.locator("summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Gildan is always stocked.")).toBeVisible();
});

test("footer has FAQ link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "FAQ" })).toBeVisible();
});

test("unknown route returns 404 branded page", async ({ page }) => {
  const response = await page.goto("/definitely-not-a-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/ran off chasing a squirrel/i);
  await expect(page.locator("#main").getByRole("link", { name: "Home" })).toBeVisible();
});

test("no horizontal scroll at 360px on faq", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/faq");
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  const cw = await page.evaluate(() => document.documentElement.clientWidth);
  expect(sw).toBeLessThanOrEqual(cw);
});
