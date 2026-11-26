import "server-only";

/**
 * Gate for the TEST-ONLY routes under src/app/api/test/ (sign-in-as-anyone, read the email
 * outbox). All three must hold, so a production misconfiguration can't expose them:
 * - EMAIL_DRIVER=console (never the production email driver)
 * - ENABLE_TEST_HOOKS=1 (set only by the CI e2e job and playwright.config.ts)
 * - DATABASE_URL points at a local database (localhost / 127.0.0.1 / ::1): never Render.
 */
export function testHooksEnabled(): boolean {
  if (process.env.EMAIL_DRIVER !== "console" || process.env.ENABLE_TEST_HOOKS !== "1") return false;
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}
