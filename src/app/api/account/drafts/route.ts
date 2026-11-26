import { and, count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { readArtworkParts } from "@/lib/artwork-upload";
import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { verifiedUser } from "@/lib/auth/session";
import { zodFieldErrors } from "@/lib/action-result";
import { getDb, schema } from "@/lib/db";
import { draftFilesExpireAt } from "@/lib/drafts";
import { BodyTooLargeError, readFormDataLimited } from "@/lib/http";
import { draftPayloadSchema, MAX_DRAFTS } from "@/lib/member-schemas";
import { artworkCount, MOCKUP_ARTWORK_TOTAL_BYTES, type MockupArtworkRecord } from "@/lib/mockup-schema";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { buildObjectKey, getStorage } from "@/lib/storage";

export type DraftSummary = {
  id: string;
  name: string;
  garment: string;
  updatedAt: string;
  imageCount: number;
  /** Images are deleted 30 days after the last save (null when there are none). */
  filesExpireAt: string | null;
};

/** GET /api/account/drafts: the member's saved drafts, newest first. */
export async function GET() {
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return fail(auth.error, auth.status);
  const rows = await db
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.userId, auth.user.id))
    .orderBy(desc(schema.drafts.updatedAt));
  const drafts: DraftSummary[] = rows.map((d) => ({
    id: d.id,
    name: d.name,
    garment: String(d.design.garment),
    updatedAt: d.updatedAt.toISOString(),
    imageCount: d.artworks.length,
    filesExpireAt: draftFilesExpireAt(d.updatedAt, d.artworks.length > 0)?.toISOString() ?? null,
  }));
  return NextResponse.json({ ok: true, drafts, max: MAX_DRAFTS }, { headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/account/drafts (multipart): `payload` = { id?, name, design } + `artwork-0…n` for
 * every image the design uses. Creates a draft, or replaces one (its old images are deleted).
 * Images go under `mockups/drafts/` (30-day bucket rule).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return fail(auth.error, auth.status);
  const user = auth.user;
  const rl = await rateLimit(db, { key: `drafts:${user.id}`, ...LIMITS.drafts });
  if (!rl.ok) return fail("Too many saves. Please try again in a bit.", 429);

  let form: FormData;
  try {
    form = await readFormDataLimited(request, MOCKUP_ARTWORK_TOTAL_BYTES + 512 * 1024);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return fail("Your images must be 30 MB or less in total.", 413);
    return fail("Invalid request.", 400);
  }
  const payload = form.get("payload");
  let json: unknown;
  try {
    json = typeof payload === "string" ? JSON.parse(payload) : null;
  } catch {
    json = null;
  }
  const parsed = draftPayloadSchema.safeParse(json);
  if (!parsed.success) return fail("Please fix the highlighted fields.", 400, zodFieldErrors(parsed.error));
  const { id, name, design } = parsed.data;

  const files = await readArtworkParts(form, artworkCount(design.views));
  if (!files.ok) return fail(files.error, 400);

  let existing: typeof schema.drafts.$inferSelect | undefined;
  if (id) {
    [existing] = await db
      .select()
      .from(schema.drafts)
      .where(and(eq(schema.drafts.id, id), eq(schema.drafts.userId, user.id)));
    if (!existing) return fail("We couldn't find that draft.", 404);
  } else {
    const [{ n }] = (await db.select({ n: count() }).from(schema.drafts).where(eq(schema.drafts.userId, user.id))) as [
      { n: number },
    ];
    if (n >= MAX_DRAFTS) return fail(`You can keep ${MAX_DRAFTS} drafts. Delete one to save another.`, 409);
  }

  const storage = getStorage();
  const artworks: MockupArtworkRecord[] = [];
  try {
    for (const f of files.files) {
      const key = buildObjectKey("mockups/drafts", f.name);
      await storage.put(key, f.bytes, f.contentType);
      artworks.push({ key, name: f.name, contentType: f.contentType, size: f.bytes.byteLength });
    }
  } catch {
    await Promise.all(artworks.map((a) => storage.delete(a.key).catch(() => undefined)));
    return fail("We couldn't store your images. Please try again.", 502);
  }

  let draftId: string;
  try {
    if (existing) {
      await db
        .update(schema.drafts)
        .set({ name, design, artworks, updatedAt: new Date() })
        .where(eq(schema.drafts.id, existing.id));
      draftId = existing.id;
    } else {
      const [row] = await db
        .insert(schema.drafts)
        .values({ userId: user.id, name, design, artworks })
        .returning({ id: schema.drafts.id });
      draftId = row!.id;
    }
  } catch {
    await Promise.all(artworks.map((a) => storage.delete(a.key).catch(() => undefined)));
    return fail("Something went wrong on our end. Please try again.", 500);
  }
  if (existing) await Promise.all(existing.artworks.map((a) => storage.delete(a.key).catch(() => undefined)));
  return NextResponse.json({ ok: true, id: draftId });
}
