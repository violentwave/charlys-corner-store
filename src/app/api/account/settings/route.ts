import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentMemberRow } from "@/lib/auth/member";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { getDb, schema } from "@/lib/db";
import { settingsSchema } from "@/lib/member-schemas";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export type AccountSettings = { email: string; name: string | null; marketingOptIn: boolean };

async function marketingOptIn(leadId: string | null) {
  if (!leadId) return false;
  const [lead] = await getDb().select().from(schema.leads).where(eq(schema.leads.id, leadId));
  return lead?.marketingOptIn ?? false;
}

/** GET /api/account/settings */
export async function GET() {
  const user = await currentMemberRow(getDb());
  if (!user) return fail("Please log in first.", 401);
  const settings: AccountSettings = {
    email: user.email,
    name: user.name,
    marketingOptIn: await marketingOptIn(user.leadId),
  };
  return NextResponse.json({ ok: true, settings }, { headers: { "cache-control": "no-store" } });
}

/** PATCH /api/account/settings { name?, marketingOptIn? }: the name and the marketing emails switch. */
export async function PATCH(request: Request) {
  const read = await readJson(request, settingsSchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const user = await currentMemberRow(db);
  if (!user) return fail("Please log in first.", 401);
  const rl = await rateLimit(db, { key: `settings:${user.id}`, ...LIMITS.settings });
  if (!rl.ok) return fail("Too many changes. Please try again later.", 429);

  if (read.data.name !== undefined) {
    await db
      .update(schema.users)
      .set({ name: read.data.name || null, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
  }
  // Marketing consent lives on the lead (the shop's customer record), so the switch is honored
  // everywhere the shop emails from. Turning it off always works; on needs a verified email.
  if (read.data.marketingOptIn !== undefined) {
    if (!user.leadId) return fail("Confirm your email first.", 403);
    await db
      .update(schema.leads)
      .set({ marketingOptIn: read.data.marketingOptIn, updatedAt: new Date() })
      .where(eq(schema.leads.id, user.leadId));
  }
  const settings: AccountSettings = {
    email: user.email,
    name: read.data.name !== undefined ? read.data.name || null : user.name,
    marketingOptIn: await marketingOptIn(user.leadId),
  };
  return NextResponse.json({ ok: true, settings });
}
