import { expect, test, type Page } from "@playwright/test";

/**
 * The hybrid one-page Home (P48-1): the header tabs keep real URLs but, when the visitor
 * is already on `/`, scroll to the matching section; scroll-spy marks the active tab.
 * Business, About and Contact stay full pages for SEO — Home carries summaries.
 */

const primaryNav = (page: Page) => page.getByRole("navigation", { name: /^primary$/i });

test("business, about and contact keep their own pages and titles", async ({ request }) => {
  for (const [path, title] of [
    ["/business", "Business &amp; Promotional Products"],
    ["/about", "About"],
    ["/contact", "Contact"],
  ] as const) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain(`<title>${title}`);
  }
});

test("a nav tab on Home scrolls to its section without leaving /", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "desktop nav only — the drawer has its own test");
  await page.goto("/");
  // Wait for hydration (the client-only builder mounts) so the click is enhanced, not a
  // full navigation racing the cold compile.
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await primaryNav(page).getByRole("link", { name: "Contact" }).click();

  await expect(page.locator("#contact")).toBeInViewport();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).hash).toBe("#contact");

  // Focus moves to the section heading (never lost under the sticky header).
  await expect(page.locator("#contact [data-section-heading]")).toBeFocused();

  // Scroll-spy: the Contact tab is marked (underline + aria-current="location").
  await expect(primaryNav(page).getByRole("link", { name: "Contact" })).toHaveAttribute("aria-current", "location");
});

test('"Home" scrolls back to the top and clears the hash', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "desktop nav only — the drawer has its own test");
  await page.goto("/");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await primaryNav(page).getByRole("link", { name: "Contact" }).click();
  await expect(page.locator("#contact")).toBeInViewport();

  await primaryNav(page).getByRole("link", { name: "Home" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(200);
  expect(new URL(page.url()).hash).toBe("");
  await expect(primaryNav(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "location");
});

test("from another page, the tabs navigate normally (no fake scrolling)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "desktop nav only — the drawer has its own test");
  await page.goto("/shop");
  await primaryNav(page).getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page).toHaveTitle(/About/);
});

test("from another page, the mobile drawer tabs navigate normally", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, "mobile only");
  await page.goto("/shop");
  await page.getByRole("button", { name: /open menu/i }).click();
  await page
    .getByRole("dialog", { name: /site navigation/i })
    .getByRole("link", { name: "About" })
    .click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page).toHaveTitle(/About/);
});

test("mobile drawer: tapping a tab closes the drawer and lands on the section", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, "mobile only");
  await page.goto("/");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /open menu/i }).click();
  await page
    .getByRole("dialog", { name: /site navigation/i })
    .getByRole("link", { name: "About" })
    .click();

  await expect(page.getByRole("dialog", { name: /site navigation/i })).toBeHidden();
  await expect(page.locator("#about")).toBeInViewport();
  await expect(page.locator("#about [data-section-heading]")).toBeFocused();
  expect(new URL(page.url()).hash).toBe("#about");
});

test("smooth scrolling is on only when motion is allowed", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior))
    .toBe("smooth");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});

test("below-the-fold forms render their Turnstile widget only when near the viewport", async ({ page }) => {
  await page.goto("/");

  // The contact form sits far below the fold: its widget stays deferred on load...
  const contactTurnstile = page.locator("#contact [data-testid='turnstile']").first();
  await expect(contactTurnstile).toHaveAttribute("data-turnstile-state", "deferred");

  // ...and renders once the form scrolls near (or the builder's own upload section does).
  await page.locator("#upload").scrollIntoViewIfNeeded();
  await expect(page.locator("#upload [data-testid='turnstile']")).toHaveAttribute(
    "data-turnstile-state",
    /ready|solved/,
    { timeout: 15_000 },
  );
  await contactTurnstile.scrollIntoViewIfNeeded();
  await expect(contactTurnstile).toHaveAttribute("data-turnstile-state", /ready|solved/, { timeout: 15_000 });
});

test("no horizontal scroll on Home at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
