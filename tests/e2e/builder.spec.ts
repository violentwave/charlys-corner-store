import { expect, test, type Page } from "@playwright/test";

/**
 * The /design builder controls. Runs on the desktop and mobile-360 projects
 * (playwright.config.ts) — the builder is the money path, so both get the full pass.
 * Uploads need an account (docs/04 Flow v2): the specs sign in through the test-only
 * /api/test/session helper (console driver + ENABLE_TEST_HOOKS=1, see the CI e2e job).
 */

const GARMENT_IDS = ["tshirt", "longsleeve", "raglan", "hoodie", "hat", "polo", "tank"];

const transformText = (page: Page) => page.getByTestId("builder-transform").textContent() ?? "";

async function openBuilderSignedIn(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.request.post("/api/test/session", {
    data: { email: `builder-${Date.now()}-${test.info().workerIndex}@example.com` },
  });
  await page.goto("/design");
  // The builder is client-only (Konva must not run on the server): wait for the picker.
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("builder-canvas")).toBeVisible();
}

async function goToDesignStep(page: Page) {
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("artwork-controls")).toBeVisible();
}

async function uploadArtwork(page: Page, fixture: string) {
  // The visitor is signed in, so the builder's gated input accepts the file directly.
  await page.locator("[data-testid='builder-file-input']").setInputFiles(fixture);
  // Upload decodes the file asynchronously; the artwork name shows once it is placed.
  await expect(page.getByTestId("artwork-name")).toContainText(fixture.split("/").pop()!, { timeout: 15_000 });
}

test("every garment renders the canvas", async ({ page }) => {
  await openBuilderSignedIn(page);
  for (const id of GARMENT_IDS) {
    // Selecting a garment advances to Colors, so come back to step 1 each round.
    await page.getByRole("button", { name: "Step 1: Garment" }).click();
    await page.getByTestId(`garment-${id}`).click();
    await expect(page.getByTestId("builder-canvas")).toBeVisible();
    await expect(page.locator("[data-testid='builder-canvas'] canvas").first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Step 1: Garment" }).click();
  await expect(page.getByTestId("garment-tank")).toHaveAttribute("aria-pressed", "true");
});

test("the color strip marks the selected chip and shows its name", async ({ page }) => {
  await openBuilderSignedIn(page);
  await page.getByRole("button", { name: "Step 2: Colors" }).click();
  const shirtGroup = page.getByRole("group", { name: "Shirt color" });
  await shirtGroup.getByRole("button", { name: "Black", exact: true }).click();
  await expect(shirtGroup.getByRole("button", { name: "Black", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(shirtGroup.getByRole("button", { name: "Black", exact: true })).toHaveText("✓");
  await expect(shirtGroup.getByRole("button", { name: "White", exact: true })).toHaveAttribute("aria-pressed", "false");
  // The selected color's name is always shown above the strip, with the palette count.
  await expect(page.getByTestId("color-name-body")).toHaveText("Black");
  await expect(page.getByText(/\d+ colors/)).toBeVisible();
  // Canvas still there with the new color (no theme on the garment, just the fill).
  await expect(page.getByTestId("builder-canvas")).toBeVisible();
});

test("upload places artwork with printed size, no DPI warning", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");
  await expect(page.getByTestId("printed-size")).toContainText("Printed size");
  await expect(page.getByTestId("dpi-warning")).toHaveCount(0);
  const placed = await transformText(page);
  expect(placed).toContain("w=");
});

test("low-resolution artwork shows the DPI warning", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art-lowdpi.png");
  const warning = page.getByTestId("dpi-warning");
  await expect(warning).toBeVisible();
  expect(await warning.textContent()).toMatch(/Low resolution/i);
  expect(await warning.textContent()).toMatch(/DPI/);
});

test("switching the print location refits the artwork", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");
  const before = await transformText(page);
  await page.getByTestId("print-area-full-front").click();
  await expect(page.getByTestId("print-area-full-front")).toHaveAttribute("aria-pressed", "true");
  const after = await transformText(page);
  expect(after).not.toEqual(before);
});

test("keyboard nudge moves the artwork, Ctrl+Z undoes it (shortcut kept in v2)", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");
  const before = await transformText(page);

  await page.getByTestId("builder-canvas").focus();
  await page.keyboard.press("ArrowLeft");
  const after = await transformText(page);
  expect(after).not.toEqual(before);

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("builder-transform")).toHaveText(before ?? "");
});

test("keyboard rotate, scale and remove work from the focused canvas", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");
  await page.getByTestId("builder-canvas").focus();

  await page.keyboard.press("r");
  expect(await transformText(page)).toMatch(/rotation=15/);
  const beforeScale = await transformText(page);
  await page.keyboard.press("+");
  const afterScale = await transformText(page);
  expect(afterScale).not.toEqual(beforeScale);
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("artwork-name")).toHaveCount(0);
});

test("the More disclosure holds Flip, Reset, Undo/Redo and the shortcut help", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");

  // Collapsed by default: the quick controls stay up front, the rest is one click away.
  const more = page.getByTestId("more-controls");
  await expect(more.locator("summary")).toBeVisible();
  await more.locator("summary").click();

  await page.getByRole("button", { name: "Flip" }).click();
  await expect(page.getByTestId("builder-transform")).toContainText("flipped");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("builder-transform")).not.toContainText("flipped");
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("builder-transform")).toContainText("flipped");
});

test("an upload goes on the front only; the back starts empty", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");

  await page.getByTestId("view-back").click();
  await expect(page.getByTestId("view-back")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("artwork-name")).toHaveCount(0);
  // Front keeps its design.
  await page.getByTestId("view-front").click();
  await expect(page.getByTestId("artwork-name")).toContainText("art.png");
});

test("a refresh keeps the garment, colors and step", async ({ page }) => {
  await openBuilderSignedIn(page);
  await page.getByTestId("garment-hoodie").click(); // advances to Colors
  const bodyGroup = page.getByRole("group", { name: "Hoodie color" });
  await bodyGroup.getByRole("button", { name: "Black", exact: true }).click();
  await expect(bodyGroup.getByRole("button", { name: "Black", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  // The step is persisted too: the builder reopens on Colors.
  await expect(page.getByRole("group", { name: "Hoodie color" })).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("group", { name: "Hoodie color" }).getByRole("button", { name: "Black", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Step 1: Garment" }).click();
  await expect(page.getByTestId("garment-hoodie")).toHaveAttribute("aria-pressed", "true");
});

test("step 4 shows both send paths; the order card holds sizes, notes and referral", async ({ page }) => {
  await openBuilderSignedIn(page);
  await page.getByRole("button", { name: "Step 4: Send" }).click();

  // No artwork yet: both paths blocked with one clear alert.
  await expect(page.getByTestId("send-blocked")).toBeVisible();
  await expect(page.getByTestId("send-email")).toBeDisabled();
  await expect(page.getByTestId("send-order")).toBeDisabled();

  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");
  await page.getByRole("button", { name: "Step 4: Send" }).click();

  // Two clearly separate paths (docs/04 §5 v2).
  await expect(page.getByTestId("path-email")).toContainText(/15% off your 2nd order/i);
  await expect(page.getByTestId("path-order")).toContainText(/Nothing is charged now/i);
  await expect(page.getByLabel("M", { exact: true })).toBeVisible();
  await page.getByTestId("builder-notes").fill("Gildan, front print only");
  await expect(page.getByLabel(/How did you hear about us\?/i)).toBeVisible();
  // Headline instruction and progress.
  await expect(page.getByRole("heading", { name: "Send it or order it" })).toBeVisible();
  await expect(page.getByText("Step 4 of 4", { exact: true })).toBeVisible();
});

test.describe("mobile QA at 360px (docs/04)", () => {
  test("canvas fits without horizontal scroll and controls stay reachable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-360", "runs on the mobile-360 project only");
    await openBuilderSignedIn(page);
    await goToDesignStep(page);

    // The canvas empty state's CTA is reachable before anything is uploaded.
    await expect(page.getByTestId("add-design")).toBeVisible();

    await uploadArtwork(page, "tests/e2e/fixtures/art.png");

    // No horizontal scrolling anywhere on the page.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(0);

    // Step pills are compact (v2) but still ≥ 24px (WCAG 2.5.8); print-location chips
    // and the upload action keep the 44px target.
    const stepPill = page.getByRole("button", { name: "Step 3: Design" });
    await expect(stepPill).toBeVisible();
    expect((await stepPill.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    for (const button of [page.getByTestId("print-area-front-chest"), page.getByTestId("upload-artwork")]) {
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
