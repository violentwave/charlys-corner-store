import { expect, test } from "@playwright/test";

test("about loads with one h1", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("contact loads with one h1 and correct mailto", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /charlyscornerstore@gmail\.com/i }).first()).toHaveAttribute(
    "href",
    "mailto:CHARLYSCORNERSTORE@GMAIL.COM",
  );
});

test("contact submit empty shows errors", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: /send message/i }).click();
  await expect(page.getByText("Please enter your name")).toBeVisible();
});

test("contact valid submit shows notice toast", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel(/Name/i).fill("Logan");
  await page.getByLabel(/Email/i).fill("a@b.co");
  await page.getByLabel(/Message/i).fill("Hello");
  await page.getByRole("button", { name: /send message/i }).click();
  await expect(page.getByText("Online forms are almost ready", { exact: true })).toBeVisible();
});
