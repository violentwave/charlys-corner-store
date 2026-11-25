import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { markEmailVerified } from "@/lib/auth/email-tokens";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, startSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { upsertLead } from "@/lib/leads";

/**
 * TEST-ONLY helper for Playwright: creates (or reuses) a verified account for `email` and
 * signs this browser in by setting the session cookie — so account-required flows can be
 * arranged without walking the full signup/verify UI in every spec. Doubly gated, exactly
 * like /api/test/last-email:
 * - EMAIL_DRIVER=console (dev/CI driver)
 * - ENABLE_TEST_HOOKS=1 (set only in the CI e2e job and playwright.config.ts webServer)
 */
export async function POST(request: Request) {
  if (process.env.EMAIL_DRIVER !== "console" || process.env.ENABLE_TEST_HOOKS !== "1") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  let body: { email?: unknown; name?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : null;

  const db = getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const leadId = await upsertLead(db, { email, name });
    const passwordHash = await hashPassword(`fixture-${crypto.randomUUID()}`);
    const [row] = await db
      .insert(schema.users)
      .values({ email, passwordHash, name, emailVerifiedAt: new Date(), leadId })
      .returning({ id: schema.users.id });
    userId = row!.id;
  }
  await markEmailVerified(db, userId);
  await startSession(db, userId);
  return NextResponse.json({ ok: true, [SESSION_COOKIE]: "set" }, { headers: { "cache-control": "no-store" } });
}
