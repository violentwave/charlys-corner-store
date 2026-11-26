import { connection } from "next/server";
import { NextResponse } from "next/server";

import { testHooksEnabled } from "@/lib/test-hooks";

import { _outbox } from "@/lib/email";

/**
 * TEST-ONLY helper for Playwright: reads the most recent email the console driver
 * "sent" to an address (subject + html), so specs can pick up verification codes and
 * reset links. Doubly gated — it must never exist in production:
 * - EMAIL_DRIVER=console (dev/CI driver; 404 under Resend)
 * - ENABLE_TEST_HOOKS=1 (set only in the CI e2e job and playwright.config.ts webServer)
 * - DATABASE_URL on localhost (see src/lib/test-hooks.ts)
 * NODE_ENV is "production" under `pnpm start` in CI, so it can't be the guard.
 * connection() keeps the route at request time — reading env at build time would
 * prerender (and freeze) the guard's answer.
 */
export async function GET(request: Request) {
  await connection();
  if (!testHooksEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const to = new URL(request.url).searchParams.get("to")?.trim().toLowerCase();
  if (!to) return NextResponse.json({ error: "Missing ?to= address." }, { status: 400 });

  const sent = _outbox()
    .filter((m) => [m.to].flat().some((address) => address.trim().toLowerCase() === to))
    .at(-1);
  if (!sent) return NextResponse.json({ error: "No email for that address." }, { status: 404 });

  return NextResponse.json({ subject: sent.subject, html: sent.html }, { headers: { "cache-control": "no-store" } });
}
