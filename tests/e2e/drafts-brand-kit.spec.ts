import { expect, test, type Page } from "@playwright/test";

/**
 * Saved drafts + the brand kit (P49-3, docs/02 Member perks): the builder's Save draft
 * (name dialog, update vs save-as-new), opening a draft via /?draft=<id>#design (the same
 * hydrate path as the restore link), the Drafts tab (expiry dates, delete), the Brand kit
 * tab (colors, fonts, logo) and the builder putting the kit first (inks, fonts, "Add my
 * logo").
 * Runs on the desktop and mobile-360 projects (playwright.config.ts).
 */

const unique = (tag: string) => `${tag}-${Date.now()}-${test.info().workerIndex}@example.com`;

function freshIp(page: Page) {
  return page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
}

async function fixtureAccount(page: Page, email: string) {
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email, name: "Charly Dog" } });
}

/** The builder with an image layer + a text layer on the front. */
async function buildImageAndText(page: Page, text: string) {
  await page.goto("/#design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("garment-tshirt").click();
  await page.getByTestId("garment-continue").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("upload-image").click();
  await page.locator("[data-testid='builder-file-input']").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByRole("region", { name: "Selected image" })).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("add-text").click();
  await page.getByTestId("text-layer-input").fill(text);
  await expect(page.getByTestId("layers-panel")).toContainText(text); // 2 layers: the list shows
}

test("save a draft with an image + text, start over, open it from the Drafts tab — same layers", async ({ page }) => {
  const email = unique("draft-save");
  await fixtureAccount(page, email);
  await buildImageAndText(page, "RUFF");

  // Save draft: the name is prefilled; save.
  await page.getByTestId("save-draft").click();
  const dialog = page.getByTestId("save-draft-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("draft-name")).toHaveValue(/T-Shirt draft/i);
  await dialog.getByTestId("draft-save").click();
  await expect(page.getByText("Draft saved").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("save-draft-dialog")).toHaveCount(0);

  // Start over wipes the board (and the draft link — confirm first).
  await page.getByRole("button", { name: /start over/i }).click();
  await page.getByTestId("start-over-confirm").click();
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 15_000 });

  // The Drafts tab lists it (1 image, the expiry date); Open restores the builder.
  await page.goto("/account#drafts");
  const row = page.getByTestId("drafts").getByText("T-Shirt draft", { exact: true }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("drafts").getByText(/1 image/)).toBeVisible();
  await page.getByTestId(/^open-draft-/).click();

  // The builder hydrates the draft exactly like the restore link.
  await expect(page.getByTestId("restore-status")).toContainText(/Loaded your saved design/i, { timeout: 30_000 });
  await expect(page.getByTestId("layers-panel")).toContainText("art.png");
  await expect(page.getByTestId("layers-panel")).toContainText("RUFF");

  // Update it (rename + the same draft id), then delete it from the tab.
  await page.getByTestId("save-draft").click();
  await page.getByTestId("draft-name").fill("Ruff draft v2");
  await page.getByTestId("draft-save").click();
  await expect(page.getByText("Draft saved").first()).toBeVisible({ timeout: 15_000 });

  await page.goto("/account#drafts");
  await expect(page.getByText("Ruff draft v2").first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(/^delete-draft-/).click();
  await page.getByTestId("confirm-delete-draft").click();
  await expect(page.getByText(/No saved drafts yet/i)).toBeVisible({ timeout: 15_000 });
});

test("the brand kit: save colors + font + logo → the builder shows them first", async ({ page }) => {
  const email = unique("brand-kit");
  await fixtureAccount(page, email);

  // Build the kit: one brand ink, one brand font, the fixture logo.
  await page.goto("/account#brand");
  await expect(page.getByTestId("brand-kit")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("brand-ink-picker").fill("#123456");
  await page.getByTestId("brand-ink-add").click();
  await page.getByTestId("brand-font-picker").selectOption("oswald");
  await page.getByTestId("brand-logo-input").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByTestId("brand-logo-preview")).toBeVisible();
  await page.getByTestId("brand-kit-save").click();
  await expect(page.getByTestId("brand-kit")).toContainText(/Saved/i, { timeout: 15_000 });

  // The builder: the brand ink leads the Ink row; the brand font leads the select.
  await page.goto("/#design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("garment-tshirt").click();
  await page.getByTestId("garment-continue").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("add-text").click();
  await expect(page.getByTestId("brand-inks")).toBeVisible();
  await page.getByTestId("brand-ink-123456").click();
  await expect(page.getByTestId("brand-ink-123456")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("text-layer-font").click();
  await page.getByRole("option", { name: "Oswald" }).first().click();

  // "Add my logo" drops the kit's logo in through the normal upload path.
  await page.getByTestId("add-my-logo").click();
  await expect(page.getByRole("region", { name: "Selected image" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("layers-panel")).toContainText("art.png"); // the logo's file name
});
