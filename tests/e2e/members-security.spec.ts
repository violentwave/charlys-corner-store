import { createHmac } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

/**
 * Members v2 security UI (P49-1, docs/02 2026-11-26): the 2FA code step at sign-in
 * (authenticator app with real RFC 6238 codes computed from the setup secret, emailed
 * codes via the test-only /api/test/last-email helper, one-time backup codes), the
 * Security tab (turn on/off, new backup codes, delete account) and My designs
 * (delete an emailed mockup, hide an order request). Google is NOT exercised: CI configures
 * no OAuth client, so the specs assert the Google button stays hidden.
 * Runs on the desktop and mobile-360 projects (playwright.config.ts).
 */

const FIXTURE_PW = ["give", "charly", "a-bone", "10"].join("-");
const unique = (tag: string) => `${tag}-${Date.now()}-${test.info().workerIndex}@example.com`;

/** A unique per-test IP keeps the per-IP rate limits from tripping across runs/projects. */
function freshIp(page: Page) {
  return page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
}

async function lastEmail(page: Page, to: string): Promise<{ subject: string; html: string }> {
  const res = await page.request.get(`/api/test/last-email?to=${encodeURIComponent(to)}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { subject: string; html: string };
}

const codeFromEmail = (mail: { subject: string; html: string }) =>
  mail.subject.match(/\b(\d{6})\b/)?.[1] ?? mail.html.match(/\b(\d{6})\b/)?.[1];

/**
 * RFC 6238 TOTP — the same math `src/lib/auth/totp.ts` implements (30s steps, 6 digits,
 * HMAC-SHA1). The setup endpoint answers with the base32 secret, space-grouped. Pass a
 * `when` in the future for the next step's code: the server never accepts a reused step.
 */
function totp(secretBase32: string, when = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secretBase32.replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) throw new Error("bad secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Math.floor(when / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32));
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const digest = createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/** Signs a brand-new account up through the UI (password known) and confirms the email. */
async function signUpAndVerify(page: Page, email: string) {
  await freshIp(page);
  await page.goto("/signup");
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).filter({ visible: true }).fill(FIXTURE_PW);
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
  await page.getByRole("button", { name: /create my account/i }).click();
  await expect(page).toHaveURL(/\/verify\?next=%2Faccount$/);
  const mail = await lastEmail(page, email);
  await page.getByTestId("verify-code").fill(codeFromEmail(mail) ?? "");
  await page.getByRole("button", { name: /verify my email/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Arranges a verified, signed-in account without walking the signup UI (test-only helper). */
async function fixtureAccount(page: Page, email: string) {
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email, name: "Charly Dog" } });
}

async function logout(page: Page) {
  await page.getByTestId("logout").click();
  await expect(page.getByTestId("account-link").first()).toHaveText("Log in");
}

/** The builder's happy path to an emailed mockup (signed in): upload on the front, send. */
async function sendEmailMockup(page: Page) {
  await page.goto("/#design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("garment-tshirt").click();
  await page.getByTestId("garment-continue").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("upload-image").click();
  await page.locator("[data-testid='builder-file-input']").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByRole("region", { name: "Selected image" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Step 4: Send" }).click();
  await page.getByTestId("send-email").click();
  await expect(page.getByTestId("builder-success")).toBeVisible({ timeout: 30_000 });
}

/** Same, but the order-request path (sizes required). */
async function sendOrderRequest(page: Page) {
  await page.goto("/#design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("garment-tshirt").click();
  await page.getByTestId("garment-continue").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("upload-image").click();
  await page.locator("[data-testid='builder-file-input']").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByRole("region", { name: "Selected image" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Step 4: Send" }).click();
  await page.getByTestId("send-step").getByLabel("M", { exact: true }).fill("1");
  await page.getByTestId("send-order").click();
  await expect(page.getByTestId("builder-success")).toBeVisible({ timeout: 30_000 });
}

/** The Security tab, ready to use. */
async function openSecurityTab(page: Page) {
  await page.goto("/account#security");
  await expect(page.getByTestId("security-settings")).toBeVisible({ timeout: 15_000 });
}

/**
 * Turns on the authenticator-app 2FA from the Security tab; returns the base32 secret and
 * the 10 backup codes.
 */
async function enableAppTwoFactor(page: Page): Promise<{ secret: string; codes: string[] }> {
  await openSecurityTab(page);
  await page.getByTestId("setup-totp").click();
  const secret = (await page.getByTestId("totp-secret").textContent()) ?? "";
  await page.getByTestId("totp-code").fill(totp(secret));
  await page.getByTestId("totp-enable").click();
  await expect(page.getByTestId("backup-codes")).toBeVisible({ timeout: 15_000 });
  const codes = await page.getByTestId("backup-codes-grid").locator("li").allTextContents();
  expect(codes).toHaveLength(10);
  await page.getByTestId("backup-codes-saved").click();
  await page.getByTestId("backup-codes-done").click();
  await expect(page.getByTestId("twofactor-on")).toBeVisible();
  return { secret, codes };
}

/** Signs out, logs back in with the password, and waits on the app-code step. */
async function loginToCodeStep(page: Page, email: string) {
  await logout(page);
  await page.goto("/login");
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByLabel("Password").filter({ visible: true }).fill(FIXTURE_PW);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await expect(page.getByTestId("twofactor-note")).toContainText(/authenticator app/i);
}

async function pool(): Promise<Pool> {
  const { Pool } = await import("pg");
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

test("the Google button is hidden when no OAuth client is configured (CI) — on the sign-in screens and the builder dialog", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByTestId("google-button")).toHaveCount(0);
  await page.goto("/signup");
  await expect(page.getByTestId("google-button")).toHaveCount(0);

  // The builder's sign-in dialog shows the same forms — Google stays hidden there too.
  await page.goto("/#design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("garment-tshirt").click();
  await page.getByTestId("garment-continue").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("upload-image").click();
  const dialog = page.getByTestId("sign-in-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("google-button")).toHaveCount(0);
});

test("/login shows a friendly message for the Google handoff errors", async ({ page }) => {
  await page.goto("/login?error=google_cancelled");
  await expect(page.getByText(/Google sign-in was cancelled/i)).toBeVisible();
  await page.goto("/login?error=google_unavailable");
  await expect(page.getByText(/Google sign-in isn't available right now/i)).toBeVisible();
});

test("sign in with the authenticator app: turn on, sign out, code step, in", async ({ page }) => {
  const email = unique("totp-app");
  await signUpAndVerify(page, email);
  const { secret } = await enableAppTwoFactor(page);

  await loginToCodeStep(page, email);
  // The next step's code: the enable consumed the current one, and steps never repeat.
  await page.getByTestId("twofactor-code").fill(totp(secret, Date.now() + 30_000));
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("tab", { name: /My designs/i })).toBeVisible();
});

test("a backup code works exactly once", async ({ page }) => {
  const email = unique("backup-once");
  await signUpAndVerify(page, email);
  const { codes } = await enableAppTwoFactor(page);
  const firstCode = codes[0]!;

  // First sign-in: the backup code works.
  await loginToCodeStep(page, email);
  await page.getByTestId("twofactor-backup-toggle").click();
  await page.getByTestId("twofactor-code").fill(firstCode);
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page).toHaveURL(/\/account$/);

  // Second sign-in with the same code: spent — it worked once.
  await logout(page);
  await page.goto("/login");
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByLabel("Password").filter({ visible: true }).fill(FIXTURE_PW);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.getByTestId("twofactor-backup-toggle").click();
  await page.getByTestId("twofactor-code").fill(firstCode);
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page.getByText(/That code isn't right/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("email 2FA: turn on with an emailed code, sign in with an emailed code", async ({ page }) => {
  const email = unique("twofactor-email");
  await signUpAndVerify(page, email);
  await openSecurityTab(page);

  // Setup: a code arrives by email (console driver → the test helper's outbox). Wait for
  // the send to finish before reading the outbox — the click doesn't wait for it.
  const setupResponse = page.waitForResponse((r) => r.url().includes("/api/account/security/email/setup"));
  await page.getByTestId("setup-email").click();
  expect((await setupResponse).status()).toBe(200);
  const setupMail = await lastEmail(page, email);
  await page.getByTestId("email-setup-code").fill(codeFromEmail(setupMail) ?? "");
  await page.getByTestId("email-enable").click();
  await expect(page.getByTestId("backup-codes")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("backup-codes-saved").click();
  await page.getByTestId("backup-codes-done").click();
  await expect(page.getByTestId("twofactor-on")).toContainText("Code by email");

  // Sign in: the code step says the code was emailed; the newest email holds it.
  await logout(page);
  await page.goto("/login");
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByLabel("Password").filter({ visible: true }).fill(FIXTURE_PW);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await expect(page.getByTestId("twofactor-note")).toContainText(/We emailed you a 6-digit code/i);
  const signInMail = await lastEmail(page, email);
  await page.getByTestId("twofactor-code").fill(codeFromEmail(signInMail) ?? "");
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("My designs: an emailed mockup shows its expiry and Save links, and can be deleted", async ({ page }) => {
  const email = unique("delete-mockup");
  await fixtureAccount(page, email);
  await sendEmailMockup(page);

  await page.goto("/account");
  await expect(page.getByTestId("retention-banner")).toContainText(/kept for 30 days/i);
  const card = page.getByTestId("design-card");
  await expect(card.getByTestId("save-front")).toBeVisible();
  await expect(card.getByTestId("retention-status")).toContainText(/Images deleted on/i);

  await card.getByTestId("delete-design").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/Delete this mockup\?/i);
  await expect(dialog).toContainText(/deleted for good\. Save them first/i);
  await dialog.getByTestId("confirm-remove").click();

  // The card leaves the list, announced politely; the row (and its files) are gone for good.
  await expect(page.getByTestId("design-card")).toHaveCount(0);
  const db = await pool();
  try {
    const { rows } = await db.query(
      "select count(*)::int as n from mockups m join leads l on l.id = m.lead_id where lower(l.email) = $1",
      [email],
    );
    expect(rows[0]!.n).toBe(0);
  } finally {
    await db.end();
  }
});

test("My designs: an order request is only hidden here — the shop keeps it", async ({ page }) => {
  const email = unique("hide-order");
  await fixtureAccount(page, email);
  await sendOrderRequest(page);

  await page.goto("/account");
  await page.getByRole("tab", { name: /Order requests/i }).click();
  const card = page.getByTestId("design-card");
  await expect(card.getByTestId("kept-by-shop")).toBeVisible(); // no countdown for orders
  await card.getByTestId("hide-design").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/Remove this order from your list\?/i);
  await expect(dialog).toContainText(/The shop still has your order; this only hides it here\./i);
  await dialog.getByTestId("confirm-remove").click();
  await expect(page.getByTestId("design-card")).toHaveCount(0);

  // "Hidden" not "deleted": the row stays, with hidden_by_user_at set.
  const db = await pool();
  try {
    const { rows } = await db.query(
      "select m.hidden_by_user_at from mockups m join leads l on l.id = m.lead_id where lower(l.email) = $1",
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hidden_by_user_at).not.toBeNull();
  } finally {
    await db.end();
  }
});

test("delete account: confirmed with password + DELETE, signs out, lands home, row gone", async ({ page }) => {
  const email = unique("delete-account");
  await signUpAndVerify(page, email); // UI signup: the test knows the password

  await openSecurityTab(page);
  await page.getByTestId("delete-account").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/Delete your account\?/i);
  await expect(dialog).toContainText(/Order requests stay with the shop/i);

  // Submit without the password: the server's field error surfaces in the dialog.
  await dialog.getByTestId("confirm-word").fill("DELETE");
  await dialog.getByTestId("confirm-action").click();
  await expect(dialog).toContainText(/password/i);

  await dialog.getByTestId("confirm-password").fill(FIXTURE_PW);
  await dialog.getByTestId("confirm-word").fill("DELETE");
  await dialog.getByTestId("confirm-action").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("account-link").first()).toHaveText("Log in"); // signed out

  const db = await pool();
  try {
    const { rows } = await db.query("select count(*)::int as n from users where email = $1", [email]);
    expect(rows[0]!.n).toBe(0);
  } finally {
    await db.end();
  }
});
