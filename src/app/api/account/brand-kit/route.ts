import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { readArtworkParts } from "@/lib/artwork-upload";
import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { verifiedUser } from "@/lib/auth/session";
import { zodFieldErrors } from "@/lib/action-result";
import { getDb, schema } from "@/lib/db";
import { BodyTooLargeError, readFormDataLimited } from "@/lib/http";
import { brandKitSchema } from "@/lib/member-schemas";
import type { MockupArtworkRecord } from "@/lib/mockup-schema";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { buildObjectKey, getStorage } from "@/lib/storage";

/** Logos are small: 10 MB is plenty. */
const LOGO_MAX_BYTES = 10 * 1024 * 1024;

export type BrandKit = {
  inkColors: string[];
  fonts: string[];
  /** Short-lived URL for the builder to load the logo as an image layer; null when none. */
  logo: { name: string; url: string | null } | null;
};

async function view(row: typeof schema.brandKits.$inferSelect | undefined): Promise<BrandKit> {
  if (!row) return { inkColors: [], fonts: [], logo: null };
  return {
    inkColors: row.inkColors,
    fonts: row.fonts,
    logo: row.logo
      ? {
          name: row.logo.name,
          url: await getStorage()
            .signedUrl(row.logo.key, 60 * 60)
            .catch(() => null),
        }
      : null,
  };
}

/** GET /api/account/brand-kit */
export async function GET() {
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return fail(auth.error, auth.status);
  const [row] = await db.select().from(schema.brandKits).where(eq(schema.brandKits.userId, auth.user.id));
  return NextResponse.json({ ok: true, brandKit: await view(row) }, { headers: { "cache-control": "no-store" } });
}

/**
 * PUT /api/account/brand-kit (multipart): `payload` = { inkColors, fonts, removeLogo } and an
 * optional `logo-0` file. The logo is stored under `brand/` (kept: not covered by the 30-day
 * rule); a replaced or removed logo is deleted.
 */
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return fail(auth.error, auth.status);
  const user = auth.user;
  const rl = await rateLimit(db, { key: `brand-kit:${user.id}`, ...LIMITS.brandKit });
  if (!rl.ok) return fail("Too many changes. Please try again in a bit.", 429);

  let form: FormData;
  try {
    form = await readFormDataLimited(request, LOGO_MAX_BYTES + 256 * 1024);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return fail("Your logo must be 10 MB or less.", 413);
    return fail("Invalid request.", 400);
  }
  let json: unknown;
  try {
    const payload = form.get("payload");
    json = typeof payload === "string" ? JSON.parse(payload) : null;
  } catch {
    json = null;
  }
  const parsed = brandKitSchema.safeParse(json);
  if (!parsed.success) return fail("Please fix the highlighted fields.", 400, zodFieldErrors(parsed.error));

  const hasLogo = [...form.keys()].includes("logo-0");
  const files = hasLogo ? await readArtworkParts(form, 1, "logo") : null;
  if (files && !files.ok) return fail(files.error, 400, { logo: files.error });

  const [existing] = await db.select().from(schema.brandKits).where(eq(schema.brandKits.userId, user.id));
  const storage = getStorage();
  let logo: MockupArtworkRecord | null = parsed.data.removeLogo ? null : (existing?.logo ?? null);
  if (files?.ok) {
    const f = files.files[0]!;
    const key = buildObjectKey("brand", f.name);
    try {
      await storage.put(key, f.bytes, f.contentType);
    } catch {
      return fail("We couldn't store your logo. Please try again.", 502);
    }
    logo = { key, name: f.name, contentType: f.contentType, size: f.bytes.byteLength };
  }

  const values = { inkColors: parsed.data.inkColors, fonts: parsed.data.fonts, logo, updatedAt: new Date() };
  const [row] = await db
    .insert(schema.brandKits)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: schema.brandKits.userId, set: values })
    .returning();
  if (existing?.logo && existing.logo.key !== logo?.key) await storage.delete(existing.logo.key).catch(() => undefined);
  return NextResponse.json({ ok: true, brandKit: await view(row) });
}
