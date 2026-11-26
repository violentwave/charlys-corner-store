import { expect, test } from "@playwright/test";

// Home now hosts four Turnstile forms (upload, quote, contact, survey): scope every
// locator to the #upload section so the builder's file input can't match instead.

test("upload form submits tiny.png and shows success", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${test.info().workerIndex + 1}` });
  await page.goto("/#upload");
  const section = page.locator("#upload");
  await section.getByLabel(/First name/i).fill("Charly");
  await section.getByLabel(/Last name/i).fill("Dog");
  await section.getByLabel(/Email/i).fill("charly@example.com");
  await section.getByLabel(/Order number/i).fill("ORD-E2E");
  await section.locator('input[type="file"]').setInputFiles("tests/fixtures/tiny.png");
  await expect(section.getByTestId("turnstile-token")).not.toHaveValue("");
  await section.getByRole("button", { name: /upload artwork/i }).click();
  await expect(section.getByText("Got it!", { exact: true })).toBeVisible();
});

test("upload form rejects fake PNG", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${test.info().workerIndex + 20}` });
  await page.goto("/#upload");
  const section = page.locator("#upload");
  await section.getByLabel(/First name/i).fill("Charly");
  await section.getByLabel(/Last name/i).fill("Dog");
  await section.getByLabel(/Email/i).fill("fake@example.com");
  await section.getByLabel(/Order number/i).fill("ORD-BAD");
  await section.locator('input[type="file"]').setInputFiles("tests/fixtures/not-an-image.png");
  await expect(section.getByTestId("turnstile-token")).not.toHaveValue("");
  await section.getByRole("button", { name: /upload artwork/i }).click();
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
