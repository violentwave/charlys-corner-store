import { expect, test } from "@playwright/test";

test("home renders logo, heading, and contact email", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#main").getByRole("img", { name: /charly's corner store logo/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#main").getByRole("link", { name: /charlyscornerstore@gmail\.com/i })).toHaveAttribute(
    "href",
    "mailto:CHARLYSCORNERSTORE@GMAIL.COM",
  );
});
