import { expect, test } from "@playwright/test";

test("desktop nav is visible and has no Home link (the logo covers it)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "desktop only");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: /primary/i });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Home" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Contact" })).toBeVisible();
});

test("the site menu opens and closes via button and Esc at every size", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: /open menu/i });
  await expect(button).toBeVisible();
  await button.click();
  const drawer = page.getByRole("dialog", { name: /site navigation/i });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("footer mailto is correct", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  const mailto = footer.getByRole("link", { name: /charlyscornerstore@gmail\.com/i });
  await expect(mailto).toHaveAttribute("href", "mailto:CHARLYSCORNERSTORE@GMAIL.COM");
});

test("footer tagline appears exactly once", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText(/Have a Ruffin awesome day/i)).toHaveCount(1);
});

test("closed site menu is not keyboard-reachable", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inMenu = await page.evaluate(() => !!document.activeElement?.closest("#site-menu"));
    expect(inMenu, `tab stop ${i + 1} landed inside the closed menu`).toBe(false);
  }
});

test("narrow viewport uses the hamburger and has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /open menu/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /^primary$/i })).toBeHidden();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(900);
});
