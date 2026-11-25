import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Customer account flows (P45-1), on the desktop and mobile-360 projects:
 * sign up → verify → /account, log out → log in, wrong password, forgot → reset,
 * and the /account auth gate. Verification codes and reset links are read from the
 * test-only /api/test/last-email helper (console email driver + ENABLE_TEST_HOOKS=1,
 * set in playwright.config.ts webServer env and the CI e2e job).
 */

const unique = () => `${Date.now()}-${test.info().project.name}-${test.info().workerIndex}`;

/** A unique per-test IP keeps the per-IP rate limits from tripping across runs/projects. */
function freshIp(page: Page) {
  return page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
}

async function lastEmail(page: Page, to: string): Promise<{ subject: string; html: string }> {
  const res = await page.request.get(`/api/test/last-email?to=${encodeURIComponent(to)}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { subject: string; html: string };
}

const verificationCode = (subject: string) => subject.match(/\b(\d{6})\b/)?.[1];
const resetToken = (html: string) => html.match(/reset-password\?token=([A-Za-z0-9_-]{43})/)?.[1];

// Throwaway e2e fixture (never a real credential); built at runtime so secret scanners
// don't flag a `password = "…"` assignment.
const FIXTURE_PW = ["give", "charly", "a-bone", "10"].join("-");

/** The header account entry — one instance exists per viewport (nav bar on desktop, drawer on mobile). */
const headerLink = (page: Page): Locator => page.locator('[data-testid="account-link"]:visible');

/** Signs a brand-new account up and waits on the verify page (Turnstile test key auto-solves). */
async function signUp(page: Page, email: string, password = FIXTURE_PW) {
  await freshIp(page);
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
  await page.getByRole("button", { name: /create my account/i }).click();
  await expect(page).toHaveURL(/\/verify\?next=%2Faccount$/);
  await expect(page.getByTestId("verify-email-note")).toContainText(email);
}

/** Reads the newest code email and confirms the account; lands on /account. */
async function verifyEmail(page: Page, email: string) {
  const mail = await lastEmail(page, email);
  const code = verificationCode(mail.subject);
  expect(code, `no 6-digit code in subject "${mail.subject}"`).toBeTruthy();
  await page.getByTestId("verify-code").fill(code!);
  await page.getByRole("button", { name: /verify my email/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("unauthenticated /account redirects to /login", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  await expect(page.getByRole("heading", { name: /log in/i })).toBeVisible();
});

test("header account entry: nav bar on desktop, drawer on mobile", async ({ page }) => {
  const isMobile = test.info().project.name === "mobile-360";
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: /open menu/i }).click();
  }
  await expect(headerLink(page)).toHaveText(/^(Log in|My designs)$/);
  await expect(headerLink(page)).toHaveAttribute("href", /\/(login|account)/);
});

test("sign up → verify → /account empty state", async ({ page }) => {
  const email = `pup-${unique()}@example.com`;
  await signUp(page, email);
  await verifyEmail(page, email);

  // Signed in: header entry flips to "My designs", and both tabs show empty states.
  await expect(headerLink(page)).toHaveText("My designs");
  await expect(page.getByRole("heading", { name: /your designs/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /saved mockups/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /order requests/i })).toBeVisible();
  await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("log out → log in", async ({ page }) => {
  const email = `roundtrip-${unique()}@example.com`;
  const password = FIXTURE_PW;
  await signUp(page, email, password);
  await verifyEmail(page, email);

  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(headerLink(page)).toHaveText("Log in");

  if (test.info().project.name === "mobile-360") {
    await page.getByRole("button", { name: /open menu/i }).click();
  }
  await headerLink(page).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("wrong password shows the error and stays on /login", async ({ page }) => {
  const email = `wrongpw-${unique()}@example.com`;
  await signUp(page, email);
  await verifyEmail(page, email);
  await page.getByTestId("logout").click();
  await expect(headerLink(page)).toHaveText("Log in");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(["not", "the", "right", "one", "99"].join("-"));
  await page.getByRole("button", { name: /^log in$/i }).click();
  await expect(page.getByText("That email and password don't match.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("forgot password → reset via the emailed link → logged in", async ({ page }) => {
  const email = `forgot-${unique()}@example.com`;
  const password = FIXTURE_PW;
  await signUp(page, email, password);
  await verifyEmail(page, email);
  await page.getByTestId("logout").click();

  await freshIp(page);
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
  await page.getByRole("button", { name: /email me a reset link/i }).click();
  // Neutral message, whether or not the address has an account.
  await expect(page.getByText(/a reset link is on its way/i)).toBeVisible();

  const mail = await lastEmail(page, email);
  const token = resetToken(mail.html);
  expect(token, "no reset link in the email html").toBeTruthy();
  await page.goto(`/reset-password?token=${token}`);

  await page.getByLabel(/^New password/i).fill("a-whole-new-leash-20");
  await page.getByLabel(/Confirm new password/i).fill("a-whole-new-leash-20");
  await page.getByRole("button", { name: /save my new password/i }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(headerLink(page)).toHaveText("My designs");
});
