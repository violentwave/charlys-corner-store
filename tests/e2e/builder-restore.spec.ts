import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

/**
 * The restore-design deep link (P4-3): the customer email's "Order this design"
 * CTA opens /design?mockup=<id>, the builder fetches the design + artwork and
 * restores at the Design step. Runs on the desktop and mobile-360 projects.
 */

async function openAndSubmit(page: Page, email: string) {
  // The builder requires a verified account (docs/04 Flow v2): the test-only /api/test/session
  // helper creates one and signs this browser in.
  // A unique per-test IP keeps the /api/mockups rate limits from tripping across runs.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.request.post("/api/test/session", { data: { email, name: "Charly Dog" } });
  await page.goto("/design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  // Hoodie: a distinctive garment (3 color zones, own print areas) so the restore
  // assertions prove garment + colors + print location came from the link.
  await page.getByTestId("garment-hoodie").click();
  await page.getByRole("group", { name: "Body color" }).getByRole("button", { name: "Black", exact: true }).click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("artwork-controls")).toBeVisible();
  await page.locator("[data-testid='builder-file-input']").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByTestId("artwork-name")).toContainText("art.png", { timeout: 15_000 });
  await page.getByTestId("print-area-full-front").click();
  await page.getByRole("button", { name: "Step 4: Send" }).click();
  await page.getByTestId("send-email").click();
  await expect(page.getByTestId("builder-success")).toBeVisible({ timeout: 30_000 });
}

async function mockupIdForEmail(email: string): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "select m.id from mockups m join leads l on l.id = m.lead_id where lower(l.email) = $1",
      [email],
    );
    expect(rows).toHaveLength(1);
    return rows[0]!.id as string;
  } finally {
    await pool.end();
  }
}

test("the restore link loads garment, colors, print location and artwork at the Design step", async ({ page }) => {
  const email = `builder-restore-${Date.now()}${test.info().workerIndex}@example.com`;
  await openAndSubmit(page, email);
  const mockupId = await mockupIdForEmail(email);

  await page.goto(`/design?mockup=${mockupId}`);
  await expect(page.getByTestId("restore-status")).toHaveText("Loaded your saved design.", { timeout: 30_000 });
  // Restored at the Design step with the artwork in place.
  await expect(page.getByTestId("artwork-controls")).toBeVisible();
  await expect(page.getByTestId("artwork-name")).toBeVisible();
  await expect(page.getByTestId("builder-transform")).toContainText("w=");
  await expect(page.getByTestId("print-area-full-front")).toHaveAttribute("aria-pressed", "true");

  // Garment and colors really come from the link, not a fresh builder.
  await page.getByRole("button", { name: "Step 1: Garment" }).click();
  await expect(page.getByTestId("garment-hoodie")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Step 2: Colors" }).click();
  await expect(
    page.getByRole("group", { name: "Body color" }).getByRole("button", { name: "Black", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("zone-lining")).toBeVisible();
});

test("an invalid mockup id shows a friendly message and a fresh builder", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.goto("/design?mockup=not-a-uuid");
  await expect(page.getByTestId("restore-status")).toHaveText("We couldn't load that saved design — starting fresh.", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("garment-picker")).toBeVisible();
});

test("an unknown mockup id shows the same friendly message", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.goto("/design?mockup=123e4567-e89b-42d3-a456-426614174999");
  await expect(page.getByTestId("restore-status")).toHaveText("We couldn't load that saved design — starting fresh.", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("garment-picker")).toBeVisible();
});
