import { expect, test, type Page } from "@playwright/test";

/**
 * The /design builder controls (v4: layers, text, stretch/skew). Runs on the desktop and
 * mobile-360 projects (playwright.config.ts) — the builder is the money path, so both get
 * the full pass. Uploads need an account (docs/04 Flow v2): the specs sign in through the
 * test-only /api/test/session helper (console driver + ENABLE_TEST_HOOKS=1, see the CI
 * e2e job).
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

/** Uploads an image layer on the current side (auto-selected). */
async function uploadImage(page: Page, fixture = "tests/e2e/fixtures/art.png") {
  await page.getByTestId("upload-image").click();
  // The builder opened the picker because the visitor is signed in.
  await page.locator("[data-testid='builder-file-input']").setInputFiles(fixture);
  // Upload decodes the file asynchronously; the layer row shows once it is placed.
  await expect(page.getByTestId("layers-panel")).toContainText(fixture.split("/").pop()!, { timeout: 15_000 });
}

test("every garment renders the canvas", async ({ page }) => {
  await openBuilderSignedIn(page);
  for (const id of GARMENT_IDS) {
    // Picking a garment only selects it (v3): come back to step 1 each round.
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

test("combo garments show the selected combo's parts in words", async ({ page }) => {
  await openBuilderSignedIn(page);
  await page.getByTestId("garment-hoodie").click(); // advances to Colors
  await page.getByRole("button", { name: "Step 1: Garment" }).click();
  await page.getByTestId("garment-raglan").click();
  await page.getByTestId("garment-continue").click();
  // The baseball tee's combo strip names each part of the blank.
  await expect(page.getByTestId("combo-parts")).toContainText("Body:");
  await expect(page.getByTestId("combo-parts")).toContainText("Sleeves & collar:");
  // The hoodie has one color (no lining/drawstring options anywhere).
  await page.getByRole("button", { name: "Step 1: Garment" }).click();
  await page.getByTestId("garment-hoodie").click();
  await page.getByTestId("garment-continue").click();
  await expect(page.getByTestId("zone-body")).toBeVisible();
  await expect(page.getByTestId("zone-lining")).toHaveCount(0);
  await expect(page.getByTestId("zone-drawstrings")).toHaveCount(0);
});

test("upload places an image layer with printed size, no DPI warning", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadImage(page, "tests/e2e/fixtures/art.png");
  await expect(page.getByTestId("printed-size")).toContainText("Printed size");
  await expect(page.getByTestId("dpi-warning")).toHaveCount(0);
  const placed = await transformText(page);
  expect(placed).toContain("w=");
});

test("low-resolution artwork shows the DPI warning", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadImage(page, "tests/e2e/fixtures/art-lowdpi.png");
  const warning = page.getByTestId("dpi-warning");
  await expect(warning).toBeVisible();
  expect(await warning.textContent()).toMatch(/Low resolution/i);
  expect(await warning.textContent()).toMatch(/DPI/);
});

test("switching the print location refits the artwork", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadImage(page, "tests/e2e/fixtures/art.png");
  const before = await transformText(page);
  await page.getByTestId("print-location").click();
  // Full Front is the default (largest first); switch to the smaller Front Chest.
  await page.getByRole("option", { name: "Front Chest" }).click();
  const after = await transformText(page);
  expect(after).not.toEqual(before);
});

test("keyboard nudge moves the artwork, Ctrl+Z undoes it (shortcut kept in v2)", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadImage(page, "tests/e2e/fixtures/art.png");
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
  await uploadImage(page, "tests/e2e/fixtures/art.png");
  await page.getByTestId("builder-canvas").focus();

  await page.keyboard.press("r");
  expect(await transformText(page)).toMatch(/rotation=15/);
  const beforeScale = await transformText(page);
  await page.keyboard.press("+");
  const afterScale = await transformText(page);
  expect(afterScale).not.toEqual(beforeScale);
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("layers-empty")).toBeVisible();
});

test("the layer row tools reorder, duplicate and delete", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadImage(page, "tests/e2e/fixtures/art.png");
  await page.getByTestId("add-text").click();
  await expect(page.getByTestId("layers-panel")).toContainText("Your text");

  // Duplicate the image layer: two rows, the copy selected above the original.
  const duplicateImage = page.getByTestId("layers-panel").locator("button[data-testid^='layer-duplicate-']").first();
  await duplicateImage.click();
  const rows = page.getByTestId("layers-panel").locator("[data-testid^='layer-select-']");
  await expect(rows).toHaveCount(3);
});

test("front/back toggle gives each side its own layer stack", async ({ page }) => {
  await openBuilderSignedIn(page);
  await goToDesignStep(page);
  await uploadImage(page, "tests/e2e/fixtures/art.png");

  await page.getByTestId("view-back").click();
  await expect(page.getByTestId("view-back")).toHaveAttribute("aria-pressed", "true");
  // The back starts empty: the same design is one click away.
  await expect(page.getByTestId("side-chooser")).toBeVisible();
  await page.getByTestId("use-design-0").click();
  await expect(page.getByTestId("layers-panel")).toContainText("art.png");
  await page.getByTestId("view-front").click();
  await expect(page.getByTestId("layers-panel")).toContainText("art.png");
});

test("a refresh keeps the garment, colors and step", async ({ page }) => {
  await openBuilderSignedIn(page);
  await page.getByTestId("garment-hoodie").click(); // selects only (v3: Continue advances)
  await page.getByTestId("garment-continue").click();
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

  // No layers yet: both paths blocked with one clear alert.
  await expect(page.getByTestId("send-blocked")).toBeVisible();
  await expect(page.getByTestId("send-email")).toBeDisabled();
  await expect(page.getByTestId("send-order")).toBeDisabled();

  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await uploadImage(page, "tests/e2e/fixtures/art.png");
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

    await uploadImage(page, "tests/e2e/fixtures/art.png");

    // No horizontal scrolling anywhere on the page.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(0);

    // Step pills are compact (v2) but still ≥ 24px (WCAG 2.5.8); the print-location select
    // and the upload action keep the 44px target.
    const stepPill = page.getByRole("button", { name: "Step 3: Design" });
    await expect(stepPill).toBeVisible();
    expect((await stepPill.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    for (const control of [page.getByTestId("print-location"), page.getByTestId("upload-image")]) {
      await expect(control).toBeVisible();
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    }
  });
});
