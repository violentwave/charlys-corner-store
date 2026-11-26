import { expect, test } from "@playwright/test";

const legacy = [
  ["/product.html", "/shop"],
  ["/about.html", "/about"],
  ["/custom-image-uploader.html", "/#upload"],
  ["/business--promotional-products.html", "/business"],
  ["/design-your-own-shirt.html", "/#design"],
] as const;

for (const [from, to] of legacy) {
  test(`legacy ${from} permanently redirects to ${to}`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe(to);
  });
}

test("/shop shows an honest coming-soon page", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText(/coming soon/i)).toBeVisible();
  await expect(page.locator("#main").getByRole("link", { name: /charlyscornerstore@gmail\.com/i })).toBeVisible();
});

test("/design 308-redirects to the Home builder section", async ({ request }) => {
  const res = await request.get("/design", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/#design");
});

// Restore links: the query must survive AND land before the hash, so the builder
// (first section on Home) reads ?mockup= after the redirect.
test("/design?mockup=<id> redirects to /?mockup=<id>#design", async ({ request }) => {
  const res = await request.get("/design?mockup=abc-123", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/?mockup=abc-123#design");
});

test("/upload 308-redirects to the Home upload section", async ({ request }) => {
  const res = await request.get("/upload", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/#upload");
});

test("/#design lands on the builder and /#upload on the upload form", async ({ page }) => {
  await page.goto("/#design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.goto("/#upload");
  await expect(page.locator("#upload").getByRole("heading", { name: /upload artwork for your order/i })).toBeVisible();
  await expect(page.locator("#upload").getByLabel(/Order number/i)).toBeVisible();
});
