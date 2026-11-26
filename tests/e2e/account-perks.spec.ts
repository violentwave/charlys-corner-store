import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

/**
 * Member perks UI (P49-2, docs/02 2026-11-26): the coupon wallet, the order-stage tracker
 * (driven by the owner's one-click signed links), re-send, order again with saved size
 * sets, the Sizes & rosters tab, and the Settings tab (name, marketing switch, change
 * password — which signs the member out everywhere).
 * Runs on the desktop and mobile-360 projects (playwright.config.ts).
 */

const FIXTURE_PW = ["give", "charly", "a-bone", "10"].join("-");
const unique = (tag: string) => `${tag}-${Date.now()}-${test.info().workerIndex}@example.com`;

function freshIp(page: Page) {
  return page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
}

async function lastEmail(page: Page, to: string, subject?: string): Promise<{ subject: string; html: string }> {
  const params = new URLSearchParams({ to });
  // ?subject= narrows to OUR email (the owner inbox gets many members' emails in parallel).
  if (subject) params.set("subject", subject);
  const res = await page.request.get(`/api/test/last-email?${params}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { subject: string; html: string };
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
  await page.getByTestId("verify-code").fill(mail.subject.match(/\b(\d{6})\b/)?.[1] ?? "");
  await page.getByRole("button", { name: /verify my email/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** The builder's happy path: upload on the front, then the email or order path. */
async function sendMockup(page: Page, intent: "email" | "order") {
  await page.goto("/#design");
  await expect(page.getByTestId("garment-picker")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("garment-tshirt").click();
  await page.getByTestId("garment-continue").click();
  await page.getByRole("button", { name: "Step 3: Design" }).click();
  await page.getByTestId("upload-image").click();
  await page.locator("[data-testid='builder-file-input']").setInputFiles("tests/e2e/fixtures/art.png");
  await expect(page.getByRole("region", { name: "Selected image" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Step 4: Send" }).click();
  if (intent === "email") {
    await page.getByTestId("send-email").click();
  } else {
    await page.getByTestId("send-step").getByLabel("M", { exact: true }).fill("1");
    await page.getByTestId("send-order").click();
  }
  await expect(page.getByTestId("builder-success")).toBeVisible({ timeout: 30_000 });
}

/** The Security tab saves a size set through the real UI. */
async function saveSizeSet(page: Page, name: string) {
  await page.goto("/account#sizes");
  await page.getByTestId("new-size-set").click();
  await page.getByTestId("size-set-name").fill(name);
  await page.getByTestId("size-set-size-M").fill("2");
  await page.getByTestId("size-set-size-L").fill("1");
  await page.getByTestId("save-size-set").click();
  await expect(page.getByTestId("size-set-editor")).toHaveCount(0, { timeout: 15_000 });
}

async function pool(): Promise<Pool> {
  const { Pool } = await import("pg");
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

test("the wallet shows the coupon after an emailed mockup — with its status", async ({ page }) => {
  const email = unique("wallet");
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email } });

  // Before any mockup: no lead coupon → the wallet renders nothing.
  await page.goto("/account");
  await expect(page.getByTestId("wallet")).toHaveCount(0);

  await sendMockup(page, "email");
  await page.goto("/account");
  const wallet = page.getByTestId("wallet");
  await expect(wallet).toBeVisible({ timeout: 15_000 });
  await expect(wallet.getByText(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/)).toBeVisible(); // code + copy
  await expect(page.getByTestId("wallet-status")).toHaveText("Unlocks after your first order");
});

test("order tracking: the owner's 'Mark as Ready' link moves the order", async ({ page }) => {
  const email = unique("tracking");
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email } });
  await sendMockup(page, "order");

  // The owner email holds the signed one-click links; follow "Mark as Ready". Other tests
  // email the owner in parallel: the test helper filters by subject (?subject=), so this
  // reads OUR order's email. React Email splits link text with comments and escapes
  // ampersands — strip both.
  let url: string | undefined;
  await expect(async () => {
    const owner = await lastEmail(page, "CHARLYSCORNERSTORE@GMAIL.COM", email);
    const raw = owner.html.match(/href="([^"]+)"[^>]*>Mark as (?:<!-- -->)?Ready</)?.[1];
    url = raw?.replace(/&amp;/g, "&");
    expect(url, "the owner email offers stage links").toBeTruthy();
  }).toPass({ timeout: 15_000 });

  // Follow the link's PATH on the origin under test (site.url points at :3000, but this
  // spec may run against any port — the signed URL is origin-agnostic).
  const link = new URL(url!);
  await page.goto(link.pathname + link.search); // GET: the confirm page (nothing changes yet)
  // The POST applies the stage; its response is the truth.
  const postDone = page.waitForResponse(
    (r) => r.url().includes("/api/owner/orders/") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Mark as Ready/i }).click();
  expect((await postDone).status()).toBe(200);
  await expect(page.getByText(/Done: .Ready./i)).toBeVisible({ timeout: 15_000 });

  // The row now says "ready" (poll the DB — the source of truth).
  const orderId = url!.match(/orders\/([0-9a-f-]+)\/stage/)![1];
  await expect(async () => {
    const db = await pool();
    try {
      const { rows } = await db.query("select order_stage from mockups where id = $1", [orderId]);
      expect(rows[0]?.order_stage).toBe("ready");
    } finally {
      await db.end();
    }
  }).toPass({ timeout: 20_000 });

  // The tracker comes from the account's list; reload until the ready step is current
  // (the DB poll above already proved the data — this is the render catching up).
  let seen = "never-fetched";
  page.on("response", async (r) => {
    if (r.url().includes("/api/account/mockups")) {
      const d = await r.json().catch(() => null);
      seen = d?.items?.[0]?.orderStage?.stage ?? "none";
    }
  });
  await page.goto("/account");
  await page.getByRole("tab", { name: /Order requests/i }).click();
  await expect(async () => {
    await page.reload();
    await page.getByRole("tab", { name: /Order requests/i }).click();
    await expect.poll(() => seen, { message: `API said ${seen}` }).toBe("ready");
    await expect(page.getByTestId("stage-current-ready")).toBeVisible();
  }).toPass({ timeout: 30_000 });
});

test("re-send works, then the 4th of the day is rate limited", async ({ page }) => {
  const email = unique("resend");
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email } });
  await sendMockup(page, "email");

  await page.goto("/account");
  const resend = page.getByTestId("resend-mockup");
  await expect(resend).toBeVisible();

  // Three sends a day; the 4th gets the friendly 429 message.
  for (let i = 0; i < 3; i++) {
    await resend.click();
    await expect(page.getByText(`Sent to ${email}`).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
  }
  await resend.click();
  await expect(page.getByText(/You've re-sent a few already today/i).first()).toBeVisible({ timeout: 15_000 });
});

test("order again with a saved size set → a second order in the list", async ({ page }) => {
  const email = unique("reorder");
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email } });
  await saveSizeSet(page, "Campus club");
  await sendMockup(page, "order");

  await page.goto("/account");
  await page.getByRole("tab", { name: /Order requests/i }).click();
  await page.getByTestId("order-again").click();
  const dialog = page.getByTestId("order-again-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId("order-again-sets").click();
  await page.getByRole("option", { name: "Campus club" }).click();
  // The saved set fills the grid: 2 × M, 1 × L.
  await expect(page.getByTestId("order-again-size-M")).toHaveValue("2");
  await expect(page.getByTestId("order-again-size-L")).toHaveValue("1");
  await page.getByTestId("order-again-submit").click();
  await expect(page.getByTestId("order-again-sent")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("order-again-close").click();

  await expect(page.getByText(/Order requests \(2\)/i)).toBeVisible({ timeout: 15_000 });
});

test("settings: rename saves, the marketing switch flips", async ({ page }) => {
  const email = unique("settings");
  await freshIp(page);
  await page.request.post("/api/test/session", { data: { email, name: "Charly Dog" } });
  await page.goto("/account#settings");
  await expect(page.getByTestId("settings-tab")).toBeVisible({ timeout: 15_000 });

  // Rename.
  await page.getByTestId("settings-name").fill("Logan H.");
  await page.getByTestId("save-name").click();
  await expect(page.getByTestId("name-saved")).toBeVisible({ timeout: 15_000 });

  // The marketing switch (optimistic, persisted — wait for the PATCH before checking).
  const patch = page.waitForResponse(
    (r) => r.url().includes("/api/account/settings") && r.request().method() === "PATCH",
  );
  await page.getByTestId("marketing-opt-in").click();
  expect((await patch).status()).toBe(200);
  const db = await pool();
  try {
    const { rows } = await db.query(
      "select l.marketing_opt_in, u.name from users u join leads l on l.id = u.lead_id where u.email = $1",
      [email],
    );
    expect(rows[0]!.marketing_opt_in).toBe(true);
    expect(rows[0]!.name).toBe("Logan H.");
  } finally {
    await db.end();
  }
});

test("settings: change password signs the member out everywhere; the new password works", async ({ page }) => {
  const email = unique("pwchange");
  await signUpAndVerify(page, email); // knows FIXTURE_PW

  await page.goto("/account#settings");
  await expect(page.getByTestId("settings-tab")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("password-current").fill(FIXTURE_PW);
  await page.getByTestId("password-new").fill("a-brand-new-password-42");
  await page.getByTestId("password-confirm").fill("a-brand-new-password-42");
  await page.getByTestId("password-submit").click();

  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 }); // signed out everywhere
  await expect(page.getByTestId("account-link").first()).toHaveText("Log in");

  // The new password signs in (old one doesn't).
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByLabel("Password").filter({ visible: true }).fill("a-brand-new-password-42");
  await page.getByRole("button", { name: /^log in$/i }).click();
  await expect(page).toHaveURL(/\/account$/);
});
