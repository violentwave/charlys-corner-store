import { expect, test, type Page } from "@playwright/test";

/**
 * Motion (P52-3): page, tab and builder-step transitions. The animation itself is
 * cosmetic — these specs guard the two things that must never break: nothing waits on
 * motion, and the anchored chrome (header) and the canvas never re-render to make a
 * transition look good.
 *
 * Runs on both projects (desktop + mobile-360) from playwright.config.ts.
 */

const unique = (tag: string) => `${tag}-${Date.now()}-${test.info().workerIndex}@example.com`;

/** A signed-in, verified member on /account (the test session helper creates the account). */
async function openAccount(page: Page) {
  await page.request.post("/api/test/session", { data: { email: unique("motion") } });
  await page.goto("/account");
  await expect(page.getByRole("tablist", { name: "Your account" })).toBeVisible({ timeout: 15_000 });
}

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("account tabs swap immediately", async ({ page }) => {
    await openAccount(page);

    await page.getByRole("tab", { name: "Settings" }).click();
    // The switch itself is instant: the Settings panel is on screen next frame (its own
    // data still loads — that is the panel's business, not the transition's).
    await expect(page.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true", {
      timeout: 1_000,
    });
    await expect(page.getByTestId("settings-loading").or(page.getByTestId("settings-tab"))).toBeVisible({
      timeout: 1_000,
    });

    await page.getByRole("tab", { name: "Security" }).click();
    await expect(page.getByRole("tab", { name: "Security" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("settings-tab")).toHaveCount(0);
    await expect(page.getByTestId("settings-loading")).toHaveCount(0);
  });

  test("builder steps swap immediately and never remount the canvas", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });

    // Mark the live canvas wrapper: a step switch must reuse it, never rebuild it.
    await page.getByTestId("builder-canvas").evaluate((el) => el.setAttribute("data-motion-probe", "1"));

    await page.getByRole("button", { name: "Step 3: Design" }).click();
    await expect(page.getByTestId("upload-image")).toBeVisible({ timeout: 1_000 });

    await page.getByRole("button", { name: "Step 2: Color" }).click();
    await expect(page.getByText("Step 2 of 4").first()).toBeVisible({ timeout: 1_000 });

    await expect(page.locator("[data-testid='builder-canvas'][data-motion-probe='1']")).toHaveCount(1);
  });

  test("mobile tool tabs swap immediately", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile-360", "the tool tabs exist below lg only");
    await page.goto("/");
    await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Step 3: Design" }).click();

    await page.getByTestId("tool-tab-side").click();
    await expect(page.getByTestId("tool-tab-side")).toHaveAttribute("aria-selected", "true");
  });

  test("page navigation swaps immediately", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "FAQ" }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible({
      timeout: 1_000,
    });
  });
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("home → FAQ → back keeps the header visible throughout", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
    const header = page.getByRole("banner");
    await expect(header).toBeVisible();

    await page.getByRole("contentinfo").getByRole("link", { name: "FAQ" }).click();

    // Sample while the page transition runs: the header is anchored, never a blank frame.
    const samples: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      samples.push(await header.isVisible());
      await page.waitForTimeout(40);
    }
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
    expect(samples.every(Boolean), "the header stayed visible during the transition").toBe(true);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(header).toBeVisible();
    await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  });

  test("navigating and switching tabs start a view transition", async ({ page }) => {
    await openAccount(page);
    // Count the browser transitions React starts: without one the CSS never runs.
    await page.evaluate(() => {
      const doc = document as unknown as { startViewTransition: (cb: () => void) => unknown };
      const w = window as unknown as { __viewTransitions?: number };
      w.__viewTransitions = 0;
      const original = doc.startViewTransition.bind(document);
      doc.startViewTransition = (cb: () => void) => {
        w.__viewTransitions = (w.__viewTransitions ?? 0) + 1;
        return original(cb);
      };
    });
    const started = () =>
      page.evaluate(() => (window as unknown as { __viewTransitions?: number }).__viewTransitions ?? 0);

    await page.getByRole("tab", { name: "Settings" }).click();
    await expect.poll(started).toBeGreaterThan(0);

    const afterTab = await started();
    await page.getByRole("contentinfo").getByRole("link", { name: "FAQ" }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect.poll(started).toBeGreaterThan(afterTab);
  });

  test("a quick double-click on two tabs ends on the second", async ({ page }) => {
    await openAccount(page);

    // No waiting between clicks: the transition overlay must not eat the second one.
    await page.getByRole("tab", { name: "Drafts" }).click();
    await page.getByRole("tab", { name: "Settings" }).click();

    await expect(page.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Drafts" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByTestId("settings-tab")).toBeVisible();
  });
});
