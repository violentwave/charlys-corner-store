import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { CartOrderCustomerEmail } from "@/emails/cart-order-customer";
import { CartOrderOwnerEmail, type CartOrderOwnerItem } from "@/emails/cart-order-owner";
import { schema, type Db } from "@/lib/db";
import { GARMENT_IDS, getGarment, VIEW_LABELS, type GarmentId } from "@/lib/garments";
import { clip } from "@/lib/http";
import { upsertLead } from "@/lib/leads";
import { mockupViewSchema, type MockupArtworkRecord, type MockupSizes } from "@/lib/mockup-schema";
import { describeLayers, mockupSummary } from "@/lib/mockup-summary";
import { notifyOwner, sendAccountEmail } from "@/lib/notify";
import { buildOrderCsv } from "@/lib/order-csv";
import { ownerQuoteUrl, ownerStageLinks } from "@/lib/order-stage";
import { buildObjectKey, type StorageDriver } from "@/lib/storage";

/**
 * The member's cart (2026-11-26): designs collected in the builder, sent as ONE order (one
 * price, one payment, one tracker). Account required. Files sit under mockups/cart/ (the
 * 30-day R2 rule cleans abandoned carts) and are copied to orders/ when the cart is sent.
 */

export const MAX_CART_ITEMS = 20;

const sizesRecord = z.record(z.string().max(8), z.number().int().min(0).max(10000));

export const cartItemUpdateSchema = z
  .object({ sizes: sizesRecord.optional(), notes: z.string().trim().max(2000).optional() })
  .refine((v) => v.sizes !== undefined || v.notes !== undefined, { message: "Nothing to update" });

export const cartSubmitSchema = z.object({ notes: z.string().trim().max(2000).optional() });

type CartRow = typeof schema.cartItems.$inferSelect;

export const pieceCount = (sizes: MockupSizes) => Object.values(sizes).reduce((n, q) => n + (q > 0 ? q : 0), 0);

/** Sizes the garment doesn't come in, or null when they're all fine. */
export function badSize(garmentId: string, sizes: MockupSizes): string | null {
  const garment = getGarment(garmentId as GarmentId);
  return Object.keys(sizes).find((s) => !garment.sizes.includes(s)) ?? null;
}

export type CartItemView = {
  id: string;
  garment: GarmentId;
  garmentName: string;
  colors: { label: string; name: string; hex: string }[];
  views: { view: string; area: string; method: string; imageUrl: string | null }[];
  sizes: MockupSizes;
  /** Every size this garment comes in, in order (for the size grid). */
  sizeOptions: string[];
  pieces: number;
  notes: string | null;
  createdAt: string;
};

export async function listCart(db: Db, storage: StorageDriver, userId: string): Promise<CartItemView[]> {
  const rows = await db
    .select()
    .from(schema.cartItems)
    .where(eq(schema.cartItems.userId, userId))
    .orderBy(asc(schema.cartItems.createdAt), asc(schema.cartItems.id));
  return Promise.all(rows.map((row) => toView(row, storage)));
}

export async function toView(row: CartRow, storage: StorageDriver): Promise<CartItemView> {
  const { garment, colorRows, viewRows } = mockupSummary(row.garment as GarmentId, row.colors, row.views, row.sizes);
  return {
    id: row.id,
    garment: row.garment as GarmentId,
    garmentName: garment.name,
    colors: colorRows,
    views: await Promise.all(
      row.views.map(async (v, i) => ({
        view: viewRows[i]!.view,
        area: viewRows[i]!.area,
        method: viewRows[i]!.method,
        imageUrl: v.mockupKey ? await storage.signedUrl(v.mockupKey, 60 * 60).catch(() => null) : null,
      })),
    ),
    sizes: row.sizes,
    sizeOptions: [...garment.sizes],
    pieces: pieceCount(row.sizes),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function cartFileKeys(row: Pick<CartRow, "views" | "artworks">): string[] {
  return [
    ...new Set([...row.artworks.map((a) => a.key), ...row.views.flatMap((v) => (v.mockupKey ? [v.mockupKey] : []))]),
  ];
}

/** Restore data for the builder (same shape as GET /api/mockups/[id]). */
export async function cartRestore(row: CartRow, storage: StorageDriver) {
  const garment = z.enum(GARMENT_IDS as [GarmentId, ...GarmentId[]]).parse(row.garment);
  const views = row.views.map((v) => mockupViewSchema.parse(v));
  const artworks = await Promise.all(row.artworks.map(async (a) => ({ url: await storage.signedUrl(a.key, 60 * 60) })));
  return {
    design: { garment, colors: row.colors, views, sizes: row.sizes },
    artworks,
    artwork: artworks[0],
    filesExpired: false,
  };
}

export type SubmitResult =
  | { ok: true; orderId: string; itemCount: number }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string> };

/** Thrown inside the transaction when another submit already took the cart. */
class CartChanged extends Error {}

/**
 * Sends the cart as one order. Every item needs at least one piece. Files are copied to
 * orders/ first; then one transaction creates the order + items and empties the cart (a second,
 * racing submit finds the rows gone and rolls back). Row first, email second.
 */
export async function submitCart(
  db: Db,
  storage: StorageDriver,
  user: { id: string; email: string; name: string | null },
  input: z.infer<typeof cartSubmitSchema>,
): Promise<SubmitResult> {
  const rows = await db
    .select()
    .from(schema.cartItems)
    .where(eq(schema.cartItems.userId, user.id))
    .orderBy(asc(schema.cartItems.createdAt), asc(schema.cartItems.id));
  if (rows.length === 0) return { ok: false, status: 400, error: "Your cart is empty." };
  const missing = rows.filter((r) => pieceCount(r.sizes) < 1);
  if (missing.length) {
    return {
      ok: false,
      status: 400,
      error: "Add sizes and quantities to every item before sending.",
      fieldErrors: Object.fromEntries(missing.map((r) => [r.id, "Add at least one size"])),
    };
  }

  // 1. Copy files cart → orders (kept; the owner prints from them).
  const copied: string[] = [];
  const moved = new Map<string, string>();
  const copy = async (key: string, name: string) => {
    if (moved.has(key)) return moved.get(key)!;
    const file = await storage.get(key);
    const next = buildObjectKey("orders", name);
    await storage.put(next, file.body, file.contentType);
    copied.push(next);
    moved.set(key, next);
    return next;
  };
  const items: { row: CartRow; views: CartRow["views"]; artworks: MockupArtworkRecord[] }[] = [];
  try {
    for (const row of rows) {
      const artworks = await Promise.all(row.artworks.map(async (a) => ({ ...a, key: await copy(a.key, a.name) })));
      const views = await Promise.all(
        row.views.map(async (v) => ({
          ...v,
          mockupKey: v.mockupKey ? await copy(v.mockupKey, `mockup-${v.view}.png`) : v.mockupKey,
        })),
      );
      items.push({ row, views, artworks });
    }
  } catch {
    await Promise.all(copied.map((k) => storage.delete(k).catch(() => undefined)));
    return {
      ok: false,
      status: 502,
      error: "We couldn't reach some of your files. Please try again, or re-add the design.",
    };
  }

  // 2. Order + items + empty the cart, all or nothing.
  const orderId = randomUUID();
  const notes = input.notes || null;
  let leadId: string;
  try {
    leadId = await upsertLead(db, { email: user.email, name: user.name });
    await db.transaction(async (tx) => {
      const taken = await tx
        .delete(schema.cartItems)
        .where(
          and(
            eq(schema.cartItems.userId, user.id),
            inArray(
              schema.cartItems.id,
              rows.map((r) => r.id),
            ),
          ),
        )
        .returning({ id: schema.cartItems.id });
      if (taken.length !== rows.length) throw new CartChanged();
      await tx.insert(schema.orders).values({ id: orderId, leadId, userId: user.id, notes });
      await tx.insert(schema.mockups).values(
        items.map(({ row, views, artworks }, i) => ({
          // A one-design order shares its id with the design (like builder orders).
          id: items.length === 1 ? orderId : undefined,
          orderId,
          userId: user.id,
          leadId,
          kind: "order" as const,
          garment: row.garment,
          colors: row.colors,
          views,
          sizes: Object.fromEntries(Object.entries(row.sizes).filter(([, q]) => q > 0)),
          notes: row.notes,
          artworks,
          artworkKey: artworks[0]?.key ?? null,
          artworkName: artworks[0]?.name ?? null,
          artworkContentType: artworks[0]?.contentType ?? null,
          artworkSizeBytes: artworks[0]?.size ?? null,
          // Keep the cart's order in the owner's list (same created_at would tie).
          createdAt: new Date(Date.now() + i),
        })),
      );
    });
  } catch (error) {
    await Promise.all(copied.map((k) => storage.delete(k).catch(() => undefined)));
    if (error instanceof CartChanged)
      return { ok: false, status: 409, error: "Your cart changed. Please check it and send again." };
    console.error("cart submit failed");
    return { ok: false, status: 500, error: "Something went wrong on our end. Please try again or email us." };
  }
  // The cart's own copies are no longer needed (the 30-day rule would get them anyway).
  await Promise.all(rows.flatMap(cartFileKeys).map((k) => storage.delete(k).catch(() => undefined)));

  await sendCartOrderEmails(storage, {
    orderId,
    user,
    notes,
    items: items.map((i) => ({ ...i.row, views: i.views, artworks: i.artworks })),
  });
  return { ok: true, orderId, itemCount: items.length };
}

async function sendCartOrderEmails(
  storage: StorageDriver,
  o: {
    orderId: string;
    user: { email: string; name: string | null };
    notes: string | null;
    items: Pick<CartRow, "garment" | "colors" | "views" | "artworks" | "sizes" | "notes">[];
  },
) {
  const link = (key: string) => storage.signedUrl(key).catch(() => `(link unavailable; storage key ${key})`);
  const ownerItems: CartOrderOwnerItem[] = await Promise.all(
    o.items.map(async (item) => {
      const { garment, colorRows, viewRows, sizeRows } = mockupSummary(
        item.garment as GarmentId,
        item.colors,
        item.views,
        item.sizes,
      );
      const views = item.views.map((v) => mockupViewSchema.parse(v));
      return {
        garmentName: garment.name,
        colors: colorRows,
        views: viewRows,
        layers: views.map((v) => ({ view: VIEW_LABELS[v.view], items: describeLayers(v.layers) })),
        sizes: sizeRows,
        pieces: pieceCount(item.sizes),
        notes: item.notes ? clip(item.notes, 2000) : undefined,
        mockups: await Promise.all(
          item.views.map(async (v, i) => ({ view: viewRows[i]!.view, signedUrl: await link(v.mockupKey) })),
        ),
        artworks: await Promise.all(
          item.artworks.map(async (a, index) => ({
            name: a.name,
            size: a.size,
            signedUrl: await link(a.key),
            usedOn: views
              .filter((v) => v.layers.some((l) => l.type === "image" && l.artwork === index))
              .map((v) => VIEW_LABELS[v.view]),
          })),
        ),
      };
    }),
  );
  const csv = buildOrderCsv(
    ownerItems.map((item, i) => ({
      item: i + 1,
      garment: item.garmentName,
      colors: item.colors.map((c) => `${c.label}: ${c.name} (${c.hex})`).join("; "),
      sides: item.views.map((v) => `${v.view}: ${v.area}`).join("; "),
      method: [...new Set(item.views.map((v) => v.method ?? ""))].join("; "),
      sizes: item.sizes.join(", "),
      pieces: item.pieces,
      notes: item.notes ?? "",
      mockups: item.mockups.map((m) => m.signedUrl).join(" "),
      originals: item.artworks.map((a) => a.signedUrl).join(" "),
    })),
  );
  const pieces = ownerItems.reduce((n, i) => n + i.pieces, 0);
  await notifyOwner(
    `ORDER REQUEST: ${ownerItems.length} design${ownerItems.length === 1 ? "" : "s"}, ${pieces} pcs · ${o.user.email}`,
    CartOrderOwnerEmail({
      orderId: o.orderId,
      email: o.user.email,
      name: o.user.name ? clip(o.user.name, 100) : undefined,
      notes: o.notes ? clip(o.notes, 2000) : undefined,
      items: ownerItems,
      stageLinks: ownerStageLinks(o.orderId),
      quoteUrl: ownerQuoteUrl(o.orderId),
    }),
    o.user.email,
    { orderId: o.orderId },
    [
      {
        filename: `order-${o.orderId.slice(0, 8)}.csv`,
        content: new TextEncoder().encode(csv),
        contentType: "text/csv",
      },
    ],
  );
  await sendAccountEmail(
    o.user.email,
    "We got your order request 🐾",
    CartOrderCustomerEmail({
      name: o.user.name ? clip(o.user.name, 40) : "there",
      orderId: o.orderId,
      items: ownerItems.map((i) => ({
        garmentName: i.garmentName,
        colors: i.colors.map((c) => c.name).join(" / "),
        sizes: i.sizes,
      })),
    }),
  );
}
