import { expect, test } from "@playwright/test";

test("hero grid has no animation under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/styleguide");
  const grid = page.locator(".hero-grid").first();
  await expect(grid).toBeVisible();
  const animationName = await grid.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toBe("none");
});

test("CouponTicket copy shows Code copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/styleguide");
  const ticket = page.getByText("CHARLY-TEST-1234", { exact: true });
  await expect(ticket).toBeVisible();
  await page.getByRole("button", { name: /copy/i }).first().click();
  await expect(page.getByText("Code copied", { exact: true })).toBeVisible();
});
