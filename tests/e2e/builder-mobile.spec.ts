import { expect, test, type Page } from "@playwright/test";

/**
 * Builder mobile layout (P51-1), mobile-360 project only: sticky canvas under the site
 * header, four tool tabs, sticky action bar, and the phone precision tools (zoom, nudge
 * pad, More menu). The canvas must never leave the screen while designing.
 */

/** The site header is h-16 (64px); the sticky canvas must sit under it, fully on screen. */
const mobileOnly = () => test.skip(test.info().project.name !== "mobile-360", "mobile-360 only");
async function expectCanvasOnScreen(page: Page) {
  const box = await page.getByTestId("builder-canvas").boundingBox();
  expect(box, "canvas is rendered").not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(63.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
}

async function openDesignStep(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.request.post("/api/test/session", {
    data: { email: `bmob-${Date.now()}-${test.info().workerIndex}@example.com` },
  });
  await page.goto("/design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("artwork-controls")).toBeVisible();
}

async function uploadImage(page: Page, fixture = "tests/e2e/fixtures/art.png") {
  await page.getByTestId("upload-image").click();
  await page.locator("[data-testid='builder-file-input']").setInputFiles(fixture);
  await expect(page.getByRole("region", { name: "Selected image" })).toBeVisible({ timeout: 15_000 });
}

test("the canvas stays in the viewport through every tab and while typing", async ({ page }) => {
  mobileOnly();
  await openDesignStep(page);
  await expectCanvasOnScreen(page);

  await page.getByTestId("tool-tab-add").click();
  await expectCanvasOnScreen(page);

  await page.getByTestId("tool-tab-side").click();
  await expect(page.getByTestId("print-location")).toBeVisible();
  await expectCanvasOnScreen(page);

  // Adding text switches to Item and the canvas holds its place while typing.
  await page.getByTestId("tool-tab-add").click();
  await page.getByTestId("add-text").click();
  await expect(page.getByTestId("tool-tab-item")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("text-layer-input").fill("Ruffin awesome");
  await expectCanvasOnScreen(page);

  await page.getByTestId("tool-tab-layers").click();
  await expect(page.getByTestId("layers-panel")).toBeVisible();
  await expectCanvasOnScreen(page);
});

test("adding text lands on Item; the Layers tab shows the live count", async ({ page }) => {
  mobileOnly();
  await openDesignStep(page);
  // 0 layers: no Layers tab at all (the canvas empty state guides).
  await expect(page.getByTestId("tool-tab-layers")).toHaveCount(0);

  await page.getByTestId("add-text").click(); // Add is the default tab at 0 layers
  await expect(page.getByTestId("tool-tab-item")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("tool-tab-layers")).toBeVisible();
  await expect(page.getByTestId("layers-count")).toHaveText("1");

  await page.getByTestId("tool-tab-add").click();
  await page.getByTestId("add-text").click();
  await expect(page.getByTestId("layers-count")).toHaveText("2");
});

test("zoom: steps 1× → 1.5× → 2×, Fit returns to 1×, the render size never changes", async ({ page }) => {
  test.setTimeout(60_000);
  mobileOnly();
  await openDesignStep(page);
  await uploadImage(page);

  const renderSize = () =>
    page.evaluate(() => {
      const canvas = document.querySelector("[data-testid='builder-canvas'] canvas") as HTMLCanvasElement | null;
      return canvas ? `${canvas.width}x${canvas.height}` : null;
    });
  const before = await renderSize();
  expect(before).toBeTruthy();

  await page.getByTestId("canvas-zoom-in").click();
  await expect(page.getByTestId("canvas-zoom-badge")).toHaveText("1.5×");
  await page.getByTestId("canvas-zoom-in").click();
  await expect(page.getByTestId("canvas-zoom-badge")).toHaveText("2×");
  // The view-only zoom never changes the render target (export math ignores it).
  expect(await renderSize()).toEqual(before);

  await page.getByTestId("canvas-zoom-fit").click();
  await expect(page.getByTestId("canvas-zoom-badge")).toHaveText("1×");
  expect(await renderSize()).toEqual(before);

  // At 1× the zoom-out button disables (nothing to zoom out from).
  await expect(page.getByTestId("canvas-zoom-out")).toBeDisabled();
  await expect(page.getByTestId("canvas-zoom-badge")).toHaveText("1×");
});

test("nudge right moves the selected layer exactly 1 template px", async ({ page }) => {
  mobileOnly();
  await openDesignStep(page);
  await uploadImage(page); // lands selected on the Item tab

  const readX = async () => {
    const text = (await page.getByTestId("builder-transform").textContent()) ?? "";
    return Number(text.match(/x=(-?\d+)/)?.[1]);
  };
  const before = await readX();
  await page.getByTestId("nudge-right").click();
  await expect(page.getByTestId("builder-transform")).toContainText(`x=${before + 1}`);
});

test("the action bar: Continue reaches step 4; More → Start over asks to confirm", async ({ page }) => {
  mobileOnly();
  await openDesignStep(page);
  const bar = page.getByTestId("action-bar");
  await expect(bar).toBeVisible();

  await bar.getByTestId("action-continue").click();
  await expect(page.getByTestId("send-step")).toBeVisible({ timeout: 15_000 });
  // Step 4 keeps its own footer; the action bar belongs to step 3 only.
  await expect(bar).toHaveCount(0);

  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("action-bar")).toBeVisible();
  await page.getByTestId("action-more").click();
  await page.getByRole("button", { name: /start over/i }).click();
  await expect(page.getByTestId("start-over-dialog")).toBeVisible();
  await page.getByRole("button", { name: /keep designing/i }).click();
  await expect(page.getByTestId("start-over-dialog")).toHaveCount(0);
});

test("no horizontal overflow with layers, zoom and every tab open", async ({ page }) => {
  mobileOnly();
  await openDesignStep(page);
  await uploadImage(page);
  await page.getByTestId("canvas-zoom-in").click();
  for (const tab of ["item", "add", "side", "layers"] as const) {
    await page.getByTestId(`tool-tab-${tab}`).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(0);
  }

  await page.getByTestId("action-continue").click();
  await expect(page.getByTestId("send-step")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);
});
