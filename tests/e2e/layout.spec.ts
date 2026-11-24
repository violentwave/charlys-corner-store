import { expect, test } from "@playwright/test";

test("desktop nav is visible", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, "desktop only");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: /primary/i });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Contact" })).toBeVisible();
});

test("mobile drawer opens and closes via button and Esc", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "mobile only");
  await page.setViewportSize({ width: 360, height: 780 });
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
