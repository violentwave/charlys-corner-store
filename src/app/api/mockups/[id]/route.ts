import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { GARMENT_IDS, type GarmentId } from "@/lib/garments";
import { mockupViewSchema } from "@/lib/mockup-schema";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";

/**
 * Restore-design deep link data for the email CTA ("Order this design" →
 * /design?mockup=<id>). Returns ONLY what the builder needs to rebuild the
 * design — never the lead (email, name, phone), notes, coupon, or lead id.
 * The mockup id is an unguessable UUID; nothing in here is personally
 * identifying, but it is still rate-limited to keep it from being probed at scale.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("That design link is not valid.", 400);

  const ip = clientIp(await headers());
  const limit = await rateLimit(getDb(), { key: `mockup-restore:${ip}`, ...LIMITS.mockupRestore });
  if (!limit.ok) return fail("Too many design lookups — please try again in a bit.", 429);

  const db = getDb();
  const [row] = await db
    .select({
      garment: schema.mockups.garment,
      colors: schema.mockups.colors,
      views: schema.mockups.views,
      sizes: schema.mockups.sizes,
      artworkKey: schema.mockups.artworkKey,
      artworks: schema.mockups.artworks,
    })
    .from(schema.mockups)
    .where(eq(schema.mockups.id, id));
  if (!row) return fail("We couldn't find that design.", 404);

  // Re-validate what the builder needs; drop everything else (mockupKey included).
  const garment = z.enum(GARMENT_IDS as [GarmentId, ...GarmentId[]]).safeParse(row.garment);
  const views = row.views.flatMap((entry) => {
    const parsed = mockupViewSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  if (!garment.success || views.length === 0) return fail("We couldn't load that design.", 404);

  // Rows from before per-view files have only artwork_key (= artwork 0).
  // Text-only designs have no files at all.
  const keys = row.artworks.length > 0 ? row.artworks.map((a) => a.key) : row.artworkKey ? [row.artworkKey] : [];
  const storage = getStorage();
  const urls = await Promise.all(keys.map((key) => storage.signedUrl(key, 60 * 60).catch(() => null)));
  if (urls.some((u) => !u)) return fail("We couldn't reach that design's artwork. Please try again.", 502);
  const artworks = urls.map((url) => ({ url: url! }));

  return NextResponse.json({
    ok: true,
    design: {
      garment: garment.data,
      colors: row.colors,
      views,
      sizes: row.sizes,
    },
    // Image layers' `artwork` indexes `artworks` (empty for text-only); `artwork` (= artworks[0]) stays for older clients.
    artworks,
    artwork: artworks[0],
  });
}
