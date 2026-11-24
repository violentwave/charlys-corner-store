import { expect, test } from "@playwright/test";

test("business lists promo items", async ({ page }) => {
  await page.goto("/business");
  for (const item of ["Hats", "Koozies", "Totes", "Mouse pads", "Pop sockets", "Lanyards", "Pillows"]) {
    await expect(page.getByText(item, { exact: false }).first()).toBeVisible();
  }
});

test("business gallery images have alt text", async ({ page }) => {
  await page.goto("/business");
  const images = page.locator("img");
  const count = await images.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(images.nth(i)).toHaveAttribute("alt", /.+/);
  }
});

test("quote submit shows errors then notice", async ({ page }) => {
  await page.goto("/business");
  await page.getByRole("button", { name: /request quote/i }).click();
  await expect(page.getByText("Please enter your name")).toBeVisible();

  await page.getByLabel(/Name/i).fill("Logan");
  await page.getByLabel(/Email/i).fill("a@b.co");
  await page.getByLabel(/What do you need/i).fill("50 tees");
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("");
  await page.getByRole("button", { name: /request quote/i }).click();
  await expect(page.getByText("Thanks!", { exact: true })).toBeVisible();
});

test("services embroidery anchor scrolls into view", async ({ page }) => {
  await page.goto("/services#embroidery");
  const section = page.locator("#embroidery");
  await expect(section).toBeInViewport();
});

test("footer shows Services link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Services" })).toBeVisible();
});

test("no horizontal scroll on business and services at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/business", "/services"]) {
    await page.goto(path);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw);
  }
});
test("one h1 per page", async ({ page }) => {
  for (const path of ["/business", "/services"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  }
});

test("only memorial shirts with a confirmed donation claim to give back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Memorial · gives back")).toHaveCount(1);
});
