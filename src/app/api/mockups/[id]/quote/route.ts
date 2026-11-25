import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { MockupOwnerEmail } from "@/emails/mockup-owner";
import { getDb, schema } from "@/lib/db";
import { getGarment, type GarmentId } from "@/lib/garments";
import { clip } from "@/lib/http";
import { mockupSummary } from "@/lib/mockup-summary";
import { notifyOwner } from "@/lib/notify";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";
import { verifyTurnstile } from "@/lib/turnstile";

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

const bodySchema = z.object({ turnstileToken: z.string().max(4096).nullable().optional() });

/**
 * "Request a quote / order this" from the success screen. Flags the existing mockup instead of
 * re-uploading everything (no duplicate row, no second customer email, no extra rate-limit use).
 * The id is only known to whoever submitted the design. The owner is notified once; repeat
 * clicks (or concurrent ones) are a no-op thanks to the conditional update.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/mockups/[id]/quote">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail("We couldn't find that mockup.", 404);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return fail("Invalid request.", 400);
  }

  const ip = clientIp(await headers());
  const token = await verifyTurnstile(body.turnstileToken ?? null, ip);
  if (!token.ok) return fail(token.error, 400);

  const db = getDb();
  const rl = await rateLimit(db, { key: `mockup-quote:${ip}`, ...LIMITS.mockup });
  if (!rl.ok) return fail("Too many requests — please try again in a bit or email us.", 429);

  let updated: { id: string } | undefined;
  try {
    [updated] = await db
      .update(schema.mockups)
      .set({ wantsQuote: true })
      .where(and(eq(schema.mockups.id, id), eq(schema.mockups.wantsQuote, false)))
      .returning({ id: schema.mockups.id });
  } catch {
    console.error("mockup quote update failed");
    return fail("Something went wrong on our end. Please try again or email us.", 500);
  }

  if (!updated) {
    // Either unknown, or already flagged (idempotent success).
    const [existing] = await db.select({ id: schema.mockups.id }).from(schema.mockups).where(eq(schema.mockups.id, id));
    return existing ? NextResponse.json({ ok: true }) : fail("We couldn't find that mockup.", 404);
  }

  const [row] = await db
    .select({ mockup: schema.mockups, lead: schema.leads, couponCode: schema.coupons.code })
    .from(schema.mockups)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.mockups.leadId))
    .leftJoin(schema.coupons, eq(schema.coupons.id, schema.mockups.couponId))
    .where(eq(schema.mockups.id, id));
  if (row) {
    const m = row.mockup;
    const garmentId = m.garment as GarmentId;
    const { garment, colorRows, viewRows, sizeRows } = mockupSummary(garmentId, m.colors, m.views, m.sizes);
    const storage = getStorage();
    const link = (key: string) => storage.signedUrl(key).catch(() => `(link unavailable; storage key ${key})`);
    await notifyOwner(
      `Quote requested: ${getGarment(garmentId).name} · ${row.lead.email}`,
      MockupOwnerEmail({
        email: row.lead.email,
        name: row.lead.name ? clip(row.lead.name, 100) : undefined,
        phone: row.lead.phone ?? undefined,
        garmentName: garment.name,
        colors: colorRows,
        views: viewRows,
        sizes: sizeRows,
        notes: m.notes ? clip(m.notes, 2000) : undefined,
        couponCode: row.couponCode ?? "(none)",
        wantsQuote: true,
        artwork: {
          name: m.artworkName,
          contentType: m.artworkContentType,
          size: m.artworkSizeBytes,
          signedUrl: await link(m.artworkKey),
        },
        mockups: await Promise.all(
          m.views.map(async (v, i) => ({ view: viewRows[i]!.view, signedUrl: await link(v.mockupKey) })),
        ),
      }),
      row.lead.email,
      { mockupId: id },
    );
  }

  return NextResponse.json({ ok: true });
}
