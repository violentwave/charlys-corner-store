import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { verifiedUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { draftFilesExpired } from "@/lib/drafts";
import { getStorage } from "@/lib/storage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ownDraft(id: string) {
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return { ok: false as const, error: fail(auth.error, auth.status) };
  if (!UUID_RE.test(id)) return { ok: false as const, error: fail("We couldn't find that draft.", 404) };
  const [draft] = await db
    .select()
    .from(schema.drafts)
    .where(and(eq(schema.drafts.id, id), eq(schema.drafts.userId, auth.user.id)));
  if (!draft) return { ok: false as const, error: fail("We couldn't find that draft.", 404) };
  return { ok: true as const, db, draft };
}

/**
 * GET /api/account/drafts/[id]: the design + short-lived image URLs, for the builder to open it
 * (same shape as the restore link: `artworks[i]` matches image layers' `artwork` index).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await ownDraft((await params).id);
  if (!found.ok) return found.error;
  const { draft } = found;
  const expired = draftFilesExpired(draft.updatedAt, draft.artworks.length > 0);
  const storage = getStorage();
  const artworks = expired
    ? []
    : await Promise.all(
        draft.artworks.map(async (a) => ({
          name: a.name,
          url: await storage.signedUrl(a.key, 60 * 60).catch(() => null),
        })),
      );
  return NextResponse.json(
    { ok: true, id: draft.id, name: draft.name, design: draft.design, artworks, filesExpired: expired },
    { headers: { "cache-control": "no-store" } },
  );
}

/** DELETE /api/account/drafts/[id]: the draft and its images. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const found = await ownDraft((await params).id);
  if (!found.ok) return found.error;
  const { db, draft } = found;
  await db.delete(schema.drafts).where(eq(schema.drafts.id, draft.id));
  const storage = getStorage();
  await Promise.all(draft.artworks.map((a) => storage.delete(a.key).catch(() => undefined)));
  return NextResponse.json({ ok: true });
}
