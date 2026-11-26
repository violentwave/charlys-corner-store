import { expect, test, type Page } from "@playwright/test";

/**
 * The site menu (P50-A): one drawer for every screen size, with a visitor "Join the pack"
 * card and a member block. Runs on the desktop and mobile-360 projects.
 * Verification codes come from the test-only /api/test/last-email helper (see accounts.spec).
 */

const unique = () => `${Date.now()}-${test.info().project.name}-${test.info().workerIndex}`;

function freshIp(page: Page) {
  return page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 254)}` });
}

async function lastEmail(page: Page, to: string): Promise<{ subject: string; html: string }> {
  const res = await page.request.get(`/api/test/last-email?to=${encodeURIComponent(to)}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { subject: string; html: string };
}

const verificationCode = (subject: string) => subject.match(/\b(\d{6})\b/)?.[1];

const FIXTURE_PW = ["give", "charly", "a-bone", "10"].join("-");

const menuButton = (page: Page) => page.getByRole("button", { name: /open menu/i });
const menuDialog = (page: Page) => page.getByRole("dialog", { name: /site navigation/i });

async function openMenu(page: Page) {
  const drawer = menuDialog(page);
  if (await drawer.isVisible()) return;
  await menuButton(page).click();
  await expect(drawer).toBeVisible();
}

/** Signs a brand-new account up, verifies it, and waits on /account. */
async function signUpAndVerify(page: Page, email: string) {
  await freshIp(page);
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(FIXTURE_PW);
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
  await page.getByRole("button", { name: /create my account/i }).click();
  await expect(page).toHaveURL(/\/verify\?next=%2Faccount$/);
  const mail = await lastEmail(page, email);
  const code = verificationCode(mail.subject);
  expect(code, `no 6-digit code in subject "${mail.subject}"`).toBeTruthy();
  await page.getByTestId("verify-code").fill(code!);
  await page.getByRole("button", { name: /verify my email/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("visitor menu shows the Join card at both sizes", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  const dialog = menuDialog(page);

  await expect(dialog.getByText(/join the pack/i)).toBeVisible();
  await expect(dialog.getByText(/save designs, track orders/i)).toBeVisible();
  // Google only renders when its OAuth client is configured; the email entry points always do.
  await expect(dialog.getByRole("link", { name: "Create account" })).toHaveAttribute("href", /\/signup\?next=%2F$/);
  await expect(dialog.getByTestId("account-link")).toHaveAttribute("href", /\/login\?next=%2F$/);
});

test("Esc closes the menu and focus returns to the menu button", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  await page.keyboard.press("Escape");
  await expect(menuDialog(page)).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
});

test("member menu shows the greeting and account links", async ({ page }) => {
  const email = `menu-${unique()}@example.com`;
  await signUpAndVerify(page, email);

  await openMenu(page);
  const dialog = menuDialog(page);
  // Name is null on signup: the greeting falls back to the email.
  await expect(dialog.getByText(new RegExp(`Hey, ${email}`, "i"))).toBeVisible();
  for (const label of ["My designs", "Drafts", "Brand kit", "Sizes & rosters", "Settings", "Security"]) {
    await expect(dialog.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(dialog.getByRole("button", { name: "Log out" })).toBeVisible();
});

test("member: clicking Drafts on /account switches to the Drafts tab", async ({ page }) => {
  const email = `drafts-${unique()}@example.com`;
  await signUpAndVerify(page, email);

  await openMenu(page);
  await menuDialog(page).getByRole("link", { name: "Drafts" }).click();
  await expect(menuDialog(page)).toBeHidden();
  // The menu is gone; scope to what's actually on screen.
  await expect(page.getByRole("tab", { name: /drafts/i })).toHaveAttribute("data-state", "active");
  await expect(page.getByTestId("drafts-empty")).toBeVisible();
});

test("member: Log out returns to / and the menu shows the Join card again", async ({ page }) => {
  const email = `out-${unique()}@example.com`;
  await signUpAndVerify(page, email);

  await openMenu(page);
  await menuDialog(page).getByTestId("menu-logout").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(menuDialog(page)).toBeHidden();

  await openMenu(page);
  await expect(menuDialog(page).getByText(/join the pack/i)).toBeVisible();
  await expect(menuDialog(page).getByTestId("account-link")).toHaveText("Log in");
});

test("unverified member sees the verify nudge and Resend email works", async ({ page }) => {
  const email = `unverified-${unique()}@example.com`;
  await freshIp(page);
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(FIXTURE_PW);
  await expect(page.getByTestId("turnstile-token")).not.toHaveValue("", { timeout: 20_000 });
  await page.getByRole("button", { name: /create my account/i }).click();
  await expect(page).toHaveURL(/\/verify\?next=%2Faccount$/);

  await openMenu(page);
  const dialog = menuDialog(page);
  await expect(dialog.getByText(/verify your email to unlock your mockup/i)).toBeVisible();
  await dialog.getByRole("button", { name: /resend email/i }).click();
  await expect(dialog.getByText("Sent")).toBeVisible();
});

test("no horizontal overflow at 360px with the menu open", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile-360", "360px check");
  await page.goto("/");
  await openMenu(page);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(360);
});
