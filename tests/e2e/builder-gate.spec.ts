import { expect, test, type Page } from "@playwright/test";

/**
 * The /design builder v2: the account gate before upload (docs/04 Flow v2) and the two
 * send paths. Runs on the desktop and mobile-360 projects (playwright.config.ts).
 * Verification codes are read from the test-only /api/test/last-email helper
 * (console email driver + ENABLE_TEST_HOOKS=1 — see playwright.config.ts webServer env
 * and the CI e2e job env).
 */

const FIXTURE_PW = ["give", "charly", "a-bone", "10"].join("-");

async function openBuilder(page: Page) {
  await page.goto("/design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("builder-canvas")).toBeVisible();
}

/** A unique per-test IP keeps the per-IP rate limits from tripping across runs/projects. */
function freshIp(page: Page) {
  return page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
}

async function lastEmail(page: Page, to: string): Promise<{ subject: string; html: string }> {
  const res = await page.request.get(`/api/test/last-email?to=${encodeURIComponent(to)}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { subject: string; html: string };
}

/** Signs up through the real UI and confirms the email with the code from the test helper. */
async function signUpAndVerify(page: Page, email: string) {
  await freshIp(page);
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(FIXTURE_PW);
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
  await page.getByRole("button", { name: /create my account/i }).click();
  await expect(page).toHaveURL(/\/verify\?next=%2Faccount$/);

  const mail = await lastEmail(page, email);
  const code = mail.subject.match(/\b(\d{6})\b/)?.[1];
  expect(code, `no 6-digit code in subject "${mail.subject}"`).toBeTruthy();
  await page.getByTestId("verify-code").fill(code!);
  await page.getByRole("button", { name: /verify my email/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Places artwork on the front view (from the Colors step onward). */
async function uploadArtwork(page: Page, fixture = "tests/e2e/fixtures/art.png") {
  await page.getByTestId("upload-artwork").click();
  // The picker only opens because the visitor is signed in.
  await page.locator("[data-testid='builder-file-input']").setInputFiles(fixture);
  await expect(page.getByTestId("artwork-name")).toContainText(fixture.split("/").pop()!, { timeout: 15_000 });
}

test("signed-out upload opens the sign-in dialog, from the step and the canvas", async ({ page }) => {
  await openBuilder(page);
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("artwork-controls")).toBeVisible();

  // Canvas empty state: "Your design goes here" + one clear CTA.
  await expect(page.getByTestId("canvas-empty")).toBeVisible();

  await page.getByTestId("upload-artwork").click();
  const dialog = page.getByTestId("sign-in-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Create a free account/i);
  await expect(dialog).toContainText(/15% off your 2nd order/i);
  await expect(dialog.getByRole("tab", { name: "New here" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tab", { name: "I have an account" })).toBeVisible();
  await page.getByLabel("Close dialog").click();
  await expect(dialog).toHaveCount(0);

  // The canvas CTA gates the same way.
  await page.getByTestId("add-design").click();
  await expect(page.getByTestId("sign-in-dialog")).toBeVisible();
  await page.getByLabel("Close dialog").click();

  // Dropping a file is gated too (a real drop event, like a visitor dragging a file in).
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["not a real png"], "art.png", { type: "image/png" }));
    const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
    document.querySelector("[data-testid='artwork-controls']")!.dispatchEvent(drop);
  });
  await expect(page.getByTestId("sign-in-dialog")).toBeVisible();
});

test("sign up, verify and upload without ever leaving the builder", async ({ page }) => {
  const email = `builder-inline-${Date.now()}-${test.info().workerIndex}@example.com`;
  await freshIp(page);
  await openBuilder(page);
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("upload-artwork").click();

  const dialog = page.getByTestId("sign-in-dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("textbox", { name: "Password" }).fill(FIXTURE_PW);
  await expect(dialog.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
  await dialog.getByRole("button", { name: /create my account/i }).click();

  await expect(dialog).toContainText(/Check your email/i);
  const code = (await lastEmail(page, email)).subject.match(/\b(\d{6})\b/)?.[1];
  await dialog.getByTestId("verify-code").fill(code!);
  await dialog.getByRole("button", { name: /verify my email/i }).click();

  // "Add my design" opens the file picker right away.
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByTestId("dialog-add-design").click();
  await (await chooser).setFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByTestId("artwork-name")).toContainText("art.png", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/design$/);
  await expect(page.getByTestId("sign-in-dialog")).toHaveCount(0);
  // The header noticed the new session without a reload (desktop: the link sits in the bar;
  // on phones it lives in the menu drawer, covered by the accounts spec).
  if (test.info().project.name === "desktop") {
    await expect(page.getByRole("banner").getByRole("link", { name: "My designs" })).toBeVisible();
  }
});

test("full flow: sign up → verify → color strip → upload → email path → coupon + download", async ({ page }) => {
  const email = `builder-v2-${Date.now()}-${test.info().workerIndex}@example.com`;
  await signUpAndVerify(page, email);
  await freshIp(page);
  await openBuilder(page);

  // 1. Garment → 2. Colors: the strip shows the selected name above it.
  await page.getByTestId("garment-hoodie").click();
  const bodyStrip = page.getByTestId("color-strip-body");
  await expect(bodyStrip).toBeVisible();
  await expect(page.getByTestId("color-name-body")).toBeVisible();
  await bodyStrip.getByRole("button", { name: "Black", exact: true }).click();
  await expect(page.getByTestId("color-name-body")).toHaveText("Black");

  // 3. Design: upload is allowed now (verified account), and the email shows.
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("signed-in-as")).toContainText(email);
  await page.getByTestId("upload-artwork").click();
  await page.locator("[data-testid='builder-file-input']").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByTestId("artwork-name")).toContainText("art.png", { timeout: 15_000 });

  // Downloads do not exist before the design is sent.
  await expect(page.getByRole("button", { name: /download/i })).toHaveCount(0);

  // 4. Send: the email path.
  await page.getByRole("button", { name: "Step 4: Send" }).click();
  const emailPath = page.getByTestId("path-email");
  await expect(emailPath).toContainText(email);
  await page.getByTestId("send-email").click();

  const success = page.getByTestId("builder-success");
  await expect(success).toBeVisible({ timeout: 30_000 });
  await expect(success.getByText(/Mockup sent!/i)).toBeVisible();
  await expect(success.getByText(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/)).toBeVisible();
  await expect(success.getByTestId("mockup-download-front")).toBeVisible();
  await expect(success.getByTestId("mockup-image-front")).toBeVisible();

  // The success CTA goes to the order card with the design intact.
  await success.getByTestId("goto-order").click();
  await expect(page.getByTestId("path-order")).toBeVisible();
  await expect(page.getByTestId("artwork-controls")).toHaveCount(0);
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("artwork-name")).toContainText("art.png");
});

test("order path: sizes are required, the request lands under My designs", async ({ page }) => {
  const email = `order-v2-${Date.now()}-${test.info().workerIndex}@example.com`;
  // Fast path: the test-only session helper creates a verified account for this browser.
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email, name: "Charly Dog" } });
  await openBuilder(page);

  await page.getByTestId("garment-tshirt").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await uploadArtwork(page);
  await page.getByRole("button", { name: "Step 4: Send" }).click();

  // Client-side quantity rule matches the server: no sizes, no order.
  await page.getByTestId("send-order").click();
  await expect(page.getByTestId("order-needs-quantity")).toBeVisible();

  await page.getByLabel("M", { exact: true }).fill("2");
  await page.getByLabel("L", { exact: true }).fill("1");
  await page.getByTestId("builder-notes").fill("Front print only, please.");
  await page.getByTestId("send-order").click();

  const success = page.getByTestId("builder-success");
  await expect(success).toBeVisible({ timeout: 30_000 });
  await expect(success).toContainText(/Order request sent! We&#x27;ll email you the price\.|Order request sent!/i);
  await expect(success.getByTestId("order-summary")).toContainText("2 × M");
  await expect(success.getByText(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/)).toBeVisible();

  // It shows up under My designs → Order requests.
  await success.getByTestId("view-my-designs").click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("tab", { name: /order requests/i }).click();
  await expect(page.getByTestId("order-status").first()).toBeVisible({ timeout: 15_000 });
});

test("oversized artwork shows the size error and sends nothing", async ({ page }) => {
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email: `big-${Date.now()}@example.com` } });
  await openBuilder(page);
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await expect(page.getByTestId("artwork-controls")).toBeVisible();
  await page.locator("[data-testid='builder-file-input']").setInputFiles({
    name: "big.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 1),
  });
  await expect(page.getByText(/larger than 20 MB/i)).toBeVisible();
  await expect(page.getByTestId("artwork-name")).toHaveCount(0);
});
