import { expect, test, type Page } from "@playwright/test";

import { GILDAN_42000, GILDAN_5000 } from "../../src/lib/gildan-colors";
import { axeViolations } from "./axe";

/**
 * P52-2b studio shell: visual checks at 1440×900 and 390×844 (screenshots land in the
 * gitignored `tmp/studio-shots/` for the PR, never committed as baselines), axe on every
 * step and the cart, and the two things the restyle must not lose — every Gildan colour
 * and our own garment templates.
 *
 * Signed in through the test-only /api/test/session helper (console driver +
 * ENABLE_TEST_HOOKS=1, see the CI e2e job). The mobile-360 project is skipped: this file
 * sets its own two viewports.
 */

const SHOTS = "tmp/studio-shots";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function signIn(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.request.post("/api/test/session", {
    data: { email: `studio-${Date.now()}-${test.info().workerIndex}@example.com` },
  });
}

async function openBuilder(page: Page) {
  await signIn(page);
  await page.goto("/design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("builder-canvas")).toBeVisible();
}

async function goTo(page: Page, step: 1 | 2 | 3 | 4, label: string) {
  await page.getByRole("button", { name: `Step ${step}: ${label}` }).click();
}

/** Let the step transition and the first image paint finish (no ghosted/blank frames). */
const settle = (page: Page) => page.waitForTimeout(900);

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "studio.spec sets 1440×900 and 390×844 itself");
});

test("every step renders the studio shell at both sizes, axe-clean", async ({ page }) => {
  test.setTimeout(180_000);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // A reload restores the builder's saved draft (step 4 from the last pass): start clean.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await openBuilder(page);
    // The /design anchor scrolls to #design; the hero shot needs the top of the page,
    // taken once the builder has hydrated (no skeleton).
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-hero.png` });

    // #design is the hero now, so scroll to the stepper (leaving room for the header).
    // One instant jump (the site scrolls smoothly; two smooth scrolls cancel each other).
    await page.evaluate(() => {
      const stepper = document.querySelector('[data-testid="builder-progress"]');
      if (stepper) {
        window.scrollTo({
          top: stepper.getBoundingClientRect().top + window.scrollY - 96,
          behavior: "instant" as ScrollBehavior,
        });
      }
    });
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-step1-garment.png` });
    // #design is the hero; the studio (stepper, canvas, panel) is its own region.
    expect(await axeViolations(page, "#design"), `${vp.name} hero`).toEqual([]);
    expect(await axeViolations(page, '[data-testid="builder-studio"]'), `${vp.name} step 1`).toEqual([]);

    await goTo(page, 2, "Colors");
    await expect(page.getByTestId("color-name-body")).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-step2-colors.png` });
    expect(await axeViolations(page, '[data-testid="builder-studio"]'), `${vp.name} step 2`).toEqual([]);

    await goTo(page, 3, "Design");
    await expect(page.getByTestId("upload-image")).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-step3-design.png` });
    expect(await axeViolations(page, '[data-testid="builder-studio"]'), `${vp.name} step 3`).toEqual([]);

    await goTo(page, 4, "Send");
    await expect(page.getByTestId("send-step")).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-step4-send.png`, fullPage: true });
    expect(await axeViolations(page, '[data-testid="builder-studio"]'), `${vp.name} step 4`).toEqual([]);
  }
});

test("the cart wears the studio shell, axe-clean", async ({ page }) => {
  test.setTimeout(120_000);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await signIn(page);
    await page.goto("/cart");
    await expect(page.getByTestId("cart-empty")).toBeVisible({ timeout: 30_000 });
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-cart-empty.png` });
    expect(await axeViolations(page), `${vp.name} cart`).toEqual([]);
  }
});

test("every Gildan colour is still offered", async ({ page }) => {
  await openBuilder(page);
  await goTo(page, 2, "Colors");
  const shirt = page.getByRole("group", { name: "Shirt color" });
  await expect(shirt.getByRole("button")).toHaveCount(GILDAN_5000.length);
  await expect(page.getByText(`${GILDAN_5000.length} colors`)).toBeVisible();

  // The performance tee is the Gildan 42000 blank.
  await goTo(page, 1, "Garment");
  await page.getByTestId("garment-perftee").click();
  await page.getByTestId("garment-continue").click();
  await expect(shirt.getByRole("button")).toHaveCount(GILDAN_42000.length);
  await expect(page.getByText(`${GILDAN_42000.length} colors`)).toBeVisible();
});

test("the stage still renders our own garment templates", async ({ page }) => {
  const garmentRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/garments\/[^?]+\.(png|webp|jpe?g)(\?|$)/i.test(request.url())) garmentRequests.push(request.url());
  });
  await openBuilder(page);
  await expect.poll(() => garmentRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  // Our generated templates (public/garments/...), never the prototype's photos.
  expect(garmentRequests.some((url) => url.includes("/garments/"))).toBe(true);
});
