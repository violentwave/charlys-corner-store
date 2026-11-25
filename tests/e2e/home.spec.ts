import { expect, test } from "@playwright/test";

test("the mockup builder is the first thing on the home page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/design your own custom gear/i);
  const canvas = page.getByTestId("builder-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // It sits above the services section, near the top of the page.
  const canvasTop = (await canvas.boundingBox())!.y;
  const servicesTop = (await page.locator("#services").boundingBox())!.y;
  expect(canvasTop).toBeLessThan(servicesTop);
  expect(canvasTop).toBeLessThan(700);
});

test("home has one h1, featured products with prices, and coupon CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  for (const name of [
    "Gildan Cotton Tees",
    "Custom Hats",
    "Business Cards",
    "Custom Foam Koozies",
    "Austin Hodge Memorial Shirt",
    "Banners for Indoor or Outdoor Use",
  ]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  await expect(page.getByText("15% off your 2nd order")).toBeVisible();

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("referral validation shows error and valid submit shows notice", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${test.info().workerIndex + 100}` });
  await page.goto("/");
  // choose Other without specifying -> error
  await page.getByRole("combobox").last().click();
  await page.getByRole("option", { name: "Other" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Please tell us how you heard about us")).toBeVisible();

  // valid submit
  await page.getByPlaceholder("Tell us how").fill("Friend");
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Thanks!", { exact: true })).toBeVisible();
});

test("referral dropdown is labelled for assistive tech", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: /how did you hear about us/i })).toBeVisible();
});
