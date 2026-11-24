import { expect, test } from "@playwright/test";

const legacy = [
  ["/product.html", "/shop"],
  ["/about.html", "/about"],
  ["/custom-image-uploader.html", "/upload"],
  ["/business--promotional-products.html", "/business"],
  ["/design-your-own-shirt.html", "/design"],
] as const;

for (const [from, to] of legacy) {
  test(`legacy ${from} permanently redirects to ${to}`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe(to);
  });
}

for (const path of ["/shop", "/design", "/upload"]) {
  test(`${path} shows an honest coming-soon page`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText(/coming soon/i)).toBeVisible();
    await expect(page.locator("#main").getByRole("link", { name: /charlyscornerstore@gmail\.com/i })).toBeVisible();
  });
}
