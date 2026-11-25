import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

/**
 * The /design email gate end to end (P4-2): gate form → POST /api/mockups →
 * success screen with the coupon ticket and per-view downloads. Runs on the
 * desktop and mobile-360 projects (playwright.config.ts).
 */

async function openGateWithArtwork(page: Page) {
  // A unique per-test IP keeps the /api/mockups rate limits from tripping when the
  // dev server (and its rate-limit windows) is reused across runs.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.goto("/design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("artwork-controls")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByTestId("artwork-name")).toContainText("art.png", { timeout: 15_000 });
  await page.getByRole("button", { name: "Step 5: Get mockup" }).click();
  await expect(page.getByTestId("email-gate")).toBeVisible();
  // The Turnstile test key auto-solves; the buttons enable once a token lands.
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
}

test("download is not available before the email is submitted", async ({ page }) => {
  await openGateWithArtwork(page);
  // The gate is up and the artwork is placed — but there is no download anywhere.
  await expect(page.getByRole("button", { name: /download/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
});

test("invalid email shows the field error", async ({ page }) => {
  await openGateWithArtwork(page);
  await page.getByTestId("gate-email").fill("not-an-email");
  await page.getByTestId("gate-submit").click();
  await expect(page.getByText("Please enter a valid email")).toBeVisible();
  await expect(page.getByTestId("builder-success")).toHaveCount(0);
});

test("oversized artwork (>20 MB) shows the size error and sends nothing", async ({ page }) => {
  const posted: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/mockups")) posted.push(request.url());
  });

  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
  await page.goto("/design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("artwork-controls")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "big.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 1),
  });
  await expect(page.getByText("larger than 20 MB")).toBeVisible();
  // Nothing was placed and nothing was sent.
  await expect(page.getByTestId("artwork-name")).toHaveCount(0);
  await expect(page.getByTestId("builder-success")).toHaveCount(0);
  expect(posted).toEqual([]);
});

test("happy path: success screen with coupon ticket, downloads and a stored lead", async ({ page }) => {
  const suffix = `${Date.now()}${test.info().workerIndex}`;
  const email = `builder-${suffix}@example.com`;
  await openGateWithArtwork(page);
  await page.getByTestId("gate-email").fill(email);
  await page.getByTestId("gate-submit").click();

  const success = page.getByTestId("builder-success");
  await expect(success).toBeVisible({ timeout: 30_000 });
  await expect(success.getByText(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/)).toBeVisible();
  await expect(success.getByTestId("mockup-download-front")).toBeVisible();
  await expect(success.getByTestId("mockup-download-back")).toBeVisible();
  await expect(success.getByTestId("request-quote")).toBeVisible();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "select m.id, c.code from mockups m join leads l on l.id = m.lead_id join coupons c on c.id = m.coupon_id where lower(l.email) = $1",
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toMatch(/^CHARLY-/);
  } finally {
    await pool.end();
  }

  // "Design another" resets the builder (and the saved session design).
  await success.getByTestId("design-another").click();
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 15_000 });
  const saved = await page.evaluate(() => sessionStorage.getItem("charly.builder.v1"));
  expect(saved).toContain('"step":1');
});

test("requesting a quote flags the sent mockup without re-sending it", async ({ page }) => {
  const suffix = `${Date.now()}${test.info().workerIndex}`;
  const email = `builder-quote-${suffix}@example.com`;
  await openGateWithArtwork(page);
  await page.getByTestId("gate-email").fill(email);
  await page.getByTestId("gate-submit").click();

  const success = page.getByTestId("builder-success");
  await expect(success).toBeVisible({ timeout: 30_000 });
  const firstCode = await success.getByText(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/).textContent();

  // The quote request needs a fresh single-use Turnstile token.
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
  const quoteCall = page.waitForRequest((r) => /\/api\/mockups\/[0-9a-f-]{36}\/quote$/.test(r.url()));
  await success.getByTestId("request-quote").click();
  await quoteCall;
  await expect(page.getByTestId("quote-requested")).toBeVisible({ timeout: 30_000 });
  // Same success screen and code; nothing was re-uploaded.
  await expect(success.getByText(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/)).toHaveText(firstCode ?? "");
  await expect(success.getByTestId("request-quote")).toHaveCount(0);
  await expect(success.getByTestId("design-another")).toBeVisible();
});
