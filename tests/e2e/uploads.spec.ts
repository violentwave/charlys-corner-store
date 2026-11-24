import { expect, test } from "@playwright/test";

test("upload page submits tiny.png and shows success", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${test.info().workerIndex + 1}` });
  await page.goto("/upload");
  await page.getByLabel(/First name/i).fill("Charly");
  await page.getByLabel(/Last name/i).fill("Dog");
  await page.getByLabel(/Email/i).fill("charly@example.com");
  await page.getByLabel(/Order number/i).fill("ORD-E2E");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/tiny.png");
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("");
  await page.getByRole("button", { name: /upload artwork/i }).click();
  await expect(page.getByText("Got it!", { exact: true })).toBeVisible();
});

test("upload page rejects fake PNG", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${test.info().workerIndex + 20}` });
  await page.goto("/upload");
  await page.getByLabel(/First name/i).fill("Charly");
  await page.getByLabel(/Last name/i).fill("Dog");
  await page.getByLabel(/Email/i).fill("fake@example.com");
  await page.getByLabel(/Order number/i).fill("ORD-BAD");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/not-an-image.png");
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("");
  await page.getByRole("button", { name: /upload artwork/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Unsupported file|20 MB/i })).toBeVisible();
});

test("quote form with one file succeeds", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${test.info().workerIndex + 1}` });
  await page.goto("/business");
  await page.getByLabel(/Name/i).fill("Charly");
  await page.getByLabel(/Email/i).fill("quote@example.com");
  await page.getByLabel(/What do you need/i).fill("50 tees");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/tiny.png");
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("");
  await page.getByRole("button", { name: /request quote/i }).click();
  await expect(page.getByText("Thanks!", { exact: true })).toBeVisible();
});
