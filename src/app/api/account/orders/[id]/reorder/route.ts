import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { MockupOwnerEmail } from "@/emails/mockup-owner";
import { OrderRequestCustomerEmail } from "@/emails/order-request-customer";
import { fail, readJson } from "@/lib/auth/route-helpers";
import { verifiedUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getGarment, VIEW_LABELS, type GarmentId } from "@/lib/garments";
import { clip } from "@/lib/http";
import { reorderSchema, sizesTotal } from "@/lib/member-schemas";
import { mockupViewSchema } from "@/lib/mockup-schema";
import { describeLayers, mockupSummary } from "@/lib/mockup-summary";
import { confirmCustomer, notifyOwner } from "@/lib/notify";
import { ownerQuoteUrl, ownerStageLinks } from "@/lib/order-stage";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";

/**
 * POST /api/account/orders/[id]/reorder { sizes, notes? }: "Order again". A new order request
 * with the same design and the same stored files (order files are kept), new sizes. Emails go
 * out like a normal order request; the owner's says which order it repeats.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const read = await readJson(request, reorderSchema);
  if ("response" in read) return read.response;
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return fail(auth.error, auth.status);
  const user = auth.user;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("We couldn't find that order.", 404);

  const [original] = await db
    .select()
    .from(schema.mockups)
    .where(and(eq(schema.mockups.id, id), eq(schema.mockups.userId, user.id), isNull(schema.mockups.hiddenByUserAt)));
  if (!original || original.kind !== "order") return fail("We couldn't find that order.", 404);

  const garment = getGarment(original.garment as GarmentId);
  const bad = Object.keys(read.data.sizes).find((size) => !garment.sizes.includes(size));
  if (bad) return fail(`${garment.name} doesn't come in ${bad}.`, 400, { sizes: "Pick from the sizes listed" });
  if (sizesTotal(read.data.sizes) < 1) return fail("Add at least one size.", 400, { sizes: "Add at least one size" });

  // Shares the order-request limit (per account), so reorders can't flood the owner's inbox.
  const rl = await rateLimit(db, { key: `mockup-user:${user.id}`, ...LIMITS.mockupEmail });
  if (!rl.ok) return fail("Too many requests today. Please try again tomorrow or email us.", 429);

  const sizes = Object.fromEntries(Object.entries(read.data.sizes).filter(([, qty]) => qty > 0));
  const [row] = await db
    .insert(schema.mockups)
    .values({
      userId: user.id,
      leadId: original.leadId,
      garment: original.garment,
      colors: original.colors,
      views: original.views,
      sizes,
      notes: read.data.notes || null,
      kind: "order",
      orderStage: "received",
      orderStageAt: new Date(),
      reorderOf: original.id,
      artworks: original.artworks,
      artworkKey: original.artworkKey,
      artworkName: original.artworkName,
      artworkContentType: original.artworkContentType,
      artworkSizeBytes: original.artworkSizeBytes,
    })
    .returning({ id: schema.mockups.id });
  const mockupId = row!.id;

  const { colorRows, viewRows, sizeRows } = mockupSummary(
    original.garment as GarmentId,
    original.colors,
    original.views,
    sizes,
  );
  const storage = getStorage();
  const link = (key: string) => storage.signedUrl(key).catch(() => `(link unavailable; storage key ${key})`);
  const views = original.views.map((v) => mockupViewSchema.parse(v));
  await notifyOwner(
    `ORDER REQUEST (again): ${garment.name} · ${user.email}`,
    MockupOwnerEmail({
      email: user.email,
      name: user.name ? clip(user.name, 100) : undefined,
      garmentName: garment.name,
      colors: colorRows,
      views: viewRows,
      layers: views.map((v) => ({ view: VIEW_LABELS[v.view], items: describeLayers(v.layers) })),
      sizes: sizeRows,
      notes: read.data.notes ? clip(read.data.notes, 2000) : undefined,
      kind: "order",
      artworks: await Promise.all(
        original.artworks.map(async (a) => ({ ...a, signedUrl: await link(a.key), usedOn: [] as string[] })),
      ),
      mockups: await Promise.all(
        original.views.map(async (v, i) => ({ view: viewRows[i]!.view, signedUrl: await link(v.mockupKey) })),
      ),
      stageLinks: ownerStageLinks(mockupId),
      quoteUrl: ownerQuoteUrl(mockupId),
      reorderOf: original.id,
    }),
    user.email,
    { mockupId, reorderOf: original.id },
  );
  await confirmCustomer(
    db,
    user.email,
    "We got your order request 🐾",
    OrderRequestCustomerEmail({
      name: user.name ? clip(user.name, 40) : "there",
      garmentName: garment.name,
      colors: colorRows,
      views: viewRows,
      sizes: sizeRows,
      mockupId,
    }),
    { mockupId },
  );
  return NextResponse.json({ ok: true, mockupId });
}
