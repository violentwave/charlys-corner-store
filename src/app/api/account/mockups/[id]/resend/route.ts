import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { MockupCustomerEmail } from "@/emails/mockup-customer";
import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import type { GarmentId } from "@/lib/garments";
import { clip } from "@/lib/http";
import { mockupSummary } from "@/lib/mockup-summary";
import { confirmCustomer } from "@/lib/notify";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mockupFilesExpired } from "@/lib/retention";
import { getStorage } from "@/lib/storage";

/**
 * POST /api/account/mockups/[id]/resend: emails the member's mockup to them again (the same
 * email as the first time, PNGs attached). Only while the files still exist; 3 a day.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("We couldn't find that design.", 404);

  const [row] = await db
    .select()
    .from(schema.mockups)
    .where(and(eq(schema.mockups.id, id), eq(schema.mockups.userId, user.id), isNull(schema.mockups.hiddenByUserAt)));
  if (!row) return fail("We couldn't find that design.", 404);
  if (row.kind !== "mockup") return fail("Order requests aren't re-sent. Check your order email.", 400);
  if (mockupFilesExpired(row.kind, row.createdAt)) {
    return fail("This mockup's images were deleted after 30 days, so it can't be re-sent.", 410);
  }
  const rl = await rateLimit(db, { key: `mockup-resend:${user.id}`, ...LIMITS.mockupResend });
  if (!rl.ok) return fail("You've re-sent a few already today. Please try again tomorrow.", 429);

  const storage = getStorage();
  let files: { view: string; key: string; bytes: Uint8Array }[];
  try {
    files = await Promise.all(
      row.views.map(async (v) => ({ view: v.view, key: v.mockupKey, bytes: (await storage.get(v.mockupKey)).body })),
    );
  } catch {
    return fail("This mockup's images are no longer stored, so it can't be re-sent.", 410);
  }

  const { garment, colorRows, viewRows } = mockupSummary(row.garment as GarmentId, row.colors, row.views, row.sizes);
  const mockups = await Promise.all(
    files.map(async (f, i) => ({ view: viewRows[i]!.view, signedUrl: await storage.signedUrl(f.key) })),
  );
  await confirmCustomer(
    db,
    user.email,
    "Your Charly's mockup (again) 🐾",
    MockupCustomerEmail({
      name: user.name ? clip(user.name, 40) : "there",
      garmentName: garment.name,
      colors: colorRows,
      views: viewRows,
      mockups,
      mockupId: row.id,
    }),
    { mockupId: row.id, resend: true },
    files.map((f) => ({
      filename: `charlys-mockup-${row.garment}-${f.view}.png`,
      content: f.bytes,
      contentType: "image/png",
    })),
  );
  return NextResponse.json({ ok: true });
}
