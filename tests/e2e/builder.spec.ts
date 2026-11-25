import { expect, test, type Page } from "@playwright/test";

/**
 * The /design mockup builder. Runs on the desktop and mobile-360 projects
 * (playwright.config.ts) — the builder is the money path, so both get the full pass.
 */

const GARMENT_IDS = ["tshirt", "raglan", "hoodie", "hat", "polo", "tank"];

const transformText = (page: Page) => page.getByTestId("builder-transform").textContent() ?? "";

async function openBuilder(page: Page) {
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
  await page.locator("input[type=file]").setInputFiles(fixture);
  // Upload decodes the file asynchronously; the artwork name shows once it is placed.
  await expect(page.getByTestId("artwork-name")).toContainText(fixture.split("/").pop()!, { timeout: 15_000 });
}

test("every garment renders the canvas", async ({ page }) => {
  await openBuilder(page);
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

test("changing a zone color marks the swatch", async ({ page }) => {
  await openBuilder(page);
  await page.getByRole("button", { name: "Step 2: Colors" }).click();
  const shirtGroup = page.getByRole("group", { name: "Shirt color" });
  await shirtGroup.getByRole("button", { name: "Black" }).click();
  await expect(shirtGroup.getByRole("button", { name: "Black" })).toHaveAttribute("aria-pressed", "true");
  await expect(shirtGroup.getByRole("button", { name: "Black" })).toHaveText("✓");
  await expect(shirtGroup.getByRole("button", { name: "White" })).toHaveAttribute("aria-pressed", "false");
  // Canvas still there with the new color (no theme on the garment, just the fill).
  await expect(page.getByTestId("builder-canvas")).toBeVisible();
});

test("upload places artwork with printed size, no DPI warning", async ({ page }) => {
  await openBuilder(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");
  await expect(page.getByTestId("printed-size")).toContainText("Printed size");
  await expect(page.getByTestId("dpi-warning")).toHaveCount(0);
  const placed = await transformText(page);
  expect(placed).toContain("w=");
});

test("low-resolution artwork shows the DPI warning", async ({ page }) => {
  await openBuilder(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art-lowdpi.png");
  const warning = page.getByTestId("dpi-warning");
  await expect(warning).toBeVisible();
  expect(await warning.textContent()).toMatch(/Low resolution/i);
  expect(await warning.textContent()).toMatch(/DPI/);
});

test("switching the print location refits the artwork", async ({ page }) => {
  await openBuilder(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");
  const before = await transformText(page);
  await page.getByTestId("print-area-full-front").click();
  await expect(page.getByTestId("print-area-full-front")).toHaveAttribute("aria-pressed", "true");
  const after = await transformText(page);
  expect(after).not.toEqual(before);
});

test("keyboard nudge moves the artwork, undo reverts it", async ({ page }) => {
  await openBuilder(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");
  const before = await transformText(page);

  await page.getByTestId("builder-canvas").focus();
  await page.keyboard.press("ArrowLeft");
  const after = await transformText(page);
  expect(after).not.toEqual(before);

  await page.getByTestId("undo").click();
  await expect(page.getByTestId("builder-transform")).toHaveText(before ?? "");
});

test("keyboard rotate, scale and remove work from the focused canvas", async ({ page }) => {
  await openBuilder(page);
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

test("front/back toggle gives each side its own artwork", async ({ page }) => {
  await openBuilder(page);
  await goToDesignStep(page);
  await uploadArtwork(page, "tests/e2e/fixtures/art.png");

  await page.getByTestId("view-back").click();
  await expect(page.getByTestId("view-back")).toHaveAttribute("aria-pressed", "true");
  // The same file is offered on the back view too.
  await expect(page.getByTestId("artwork-name")).toContainText("art.png");
  await page.getByTestId("remove-artwork").click();
  await expect(page.getByTestId("artwork-name")).toHaveCount(0);
  // Front keeps its copy.
  await page.getByTestId("view-front").click();
  await expect(page.getByTestId("artwork-name")).toContainText("art.png");
});

test("a refresh keeps the garment, colors and step", async ({ page }) => {
  await openBuilder(page);
  await page.getByTestId("garment-hoodie").click(); // advances to Colors
  await page.getByRole("group", { name: "Body color" }).getByRole("button", { name: "Black" }).click();
  await expect(page.getByRole("group", { name: "Body color" }).getByRole("button", { name: "Black" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  // The step is persisted too: the builder reopens on Colors.
  await expect(page.getByRole("group", { name: "Body color" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("group", { name: "Body color" }).getByRole("button", { name: "Black" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Step 1: Garment" }).click();
  await expect(page.getByTestId("garment-hoodie")).toHaveAttribute("aria-pressed", "true");
});

test("details step has sizes, notes and referral; gate shows the real email form", async ({ page }) => {
  await openBuilder(page);
  await page.getByRole("button", { name: "Step 4: Details" }).click();
  await expect(page.getByTestId("details-step")).toBeVisible();
  await expect(page.getByLabel("M", { exact: true })).toBeVisible();
  await page.getByTestId("builder-notes").fill("Gildan, front print only");
  await expect(page.getByLabel(/How did you hear about us\?/i)).toBeVisible();

  await page.getByRole("button", { name: "Step 5: Get mockup" }).click();
  // P4-2: the gate is a real form now (no artwork yet → blocked until step 3 is used).
  const gate = page.getByTestId("email-gate");
  await expect(gate).toBeVisible();
  await expect(gate.getByText(/15% off your 2nd order/i)).toBeVisible();
  await expect(gate.getByTestId("gate-email")).toBeVisible();
  await expect(gate.getByTestId("gate-blocked")).toBeVisible();
});

test.describe("mobile QA at 360px (docs/04)", () => {
  test("canvas fits without horizontal scroll and controls meet the 44px target", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-360", "runs on the mobile-360 project only");
    await openBuilder(page);
    await goToDesignStep(page);
    await uploadArtwork(page, "tests/e2e/fixtures/art.png");

    // No horizontal scrolling anywhere on the page.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(0);

    // Step controls and print-location chips are reachable and ≥ 44px tall.
    for (const button of [
      page.getByRole("button", { name: "Step 3: Design" }),
      page.getByRole("button", { name: "Step 5: Get mockup" }),
      page.getByTestId("print-area-front-chest"),
    ]) {
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
