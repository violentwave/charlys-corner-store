import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { fail } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import type { GarmentId } from "@/lib/garments";
import { mockupSummary } from "@/lib/mockup-summary";
import { ORDER_STAGE_DESCRIPTIONS, ORDER_STAGE_LABELS, type OrderStage } from "@/lib/order-stage";
import { MOCKUP_FILES_RETENTION_DAYS, mockupFilesExpired } from "@/lib/retention";
import { getStorage } from "@/lib/storage";

export type AccountMockup = {
  id: string;
  kind: "mockup" | "order";
  garmentName: string;
  createdAt: string;
  status: string;
  colors: { label: string; name: string; hex: string }[];
  sizes: string[];
  /** imageUrl opens the preview; downloadUrl saves it (both null once the files are gone). */
  views: { view: string; area: string; imageUrl: string | null; downloadUrl: string | null }[];
  /** Emailed mockups' files are deleted after a few days (src/lib/retention.ts). */
  filesExpired: boolean;
  /** When the files will be deleted (ISO); null for order requests (kept). */
  filesExpireAt: string | null;
  /** What the member's "Delete" does: emailed mockups are deleted, orders only hidden. */
  removal: "delete" | "hide";
  /** Order requests: where it stands (owner updates it), with a one-line explanation. */
  orderStage: { stage: OrderStage; label: string; description: string; updatedAt: string | null } | null;
  /**
   * Order items (2026-11-26): the order this design belongs to. Several designs can share one
   * order (a cart checkout); stage, price and payment are the order's.
   */
  order: {
    id: string;
    itemCount: number;
    quoteCents: number | null;
    paidAt: string | null;
    /** /pay/<id> once priced and unpaid; null otherwise. */
    payPath: string | null;
  } | null;
  /** Emailed mockups whose files still exist can be re-sent (POST …/[id]/resend). */
  canResend: boolean;
  /** Order requests can be ordered again (POST /api/account/orders/[id]/reorder). */
  canReorder: boolean;
  /** Reopen in the builder: /design?mockup=<id> */
  restorePath: string;
};

/** "My designs" + order history for the signed-in account (newest first, last 50). */
export async function GET() {
  const db = getDb();
  const user = await currentUser(db);
  if (!user) return fail("Please log in first.", 401);

  const joined = await db
    .select({ m: schema.mockups, o: schema.orders })
    .from(schema.mockups)
    .leftJoin(schema.orders, eq(schema.orders.id, schema.mockups.orderId))
    .where(
      and(
        eq(schema.mockups.userId, user.id),
        isNull(schema.mockups.hiddenByUserAt),
        or(isNull(schema.mockups.orderId), isNull(schema.orders.hiddenByUserAt)),
      ),
    )
    .orderBy(desc(schema.mockups.createdAt), desc(schema.mockups.id))
    .limit(50);
  const orderIds = [...new Set(joined.flatMap((r) => (r.o ? [r.o.id] : [])))];
  const counts = new Map<string, number>();
  if (orderIds.length) {
    const rows = await db
      .select({ orderId: schema.mockups.orderId, n: sql<number>`count(*)::int` })
      .from(schema.mockups)
      .where(inArray(schema.mockups.orderId, orderIds))
      .groupBy(schema.mockups.orderId);
    for (const r of rows) counts.set(r.orderId!, Number(r.n));
  }
  const rows = joined.map((r) => ({ ...r.m, order: r.o }));

  const storage = getStorage();
  const items: AccountMockup[] = await Promise.all(
    rows.map(async (m) => {
      const { garment, colorRows, viewRows, sizeRows } = mockupSummary(
        m.garment as GarmentId,
        m.colors,
        m.views,
        m.sizes,
      );
      return {
        id: m.id,
        kind: m.kind,
        garmentName: garment.name,
        createdAt: m.createdAt.toISOString(),
        status: m.status,
        colors: colorRows,
        sizes: sizeRows,
        views: await Promise.all(
          m.views.map(async (v, i) => {
            const expired = mockupFilesExpired(m.kind, m.createdAt);
            const downloadName = `charlys-mockup-${m.garment}-${viewRows[i]!.view.toLowerCase().replace(/\s+/g, "-")}.png`;
            return {
              view: viewRows[i]!.view,
              area: viewRows[i]!.area,
              imageUrl: expired ? null : await storage.signedUrl(v.mockupKey, 60 * 60).catch(() => null),
              downloadUrl: expired
                ? null
                : await storage.signedUrl(v.mockupKey, 60 * 60, { downloadName }).catch(() => null),
            };
          }),
        ),
        filesExpired: mockupFilesExpired(m.kind, m.createdAt),
        filesExpireAt:
          m.kind === "order"
            ? null
            : new Date(m.createdAt.getTime() + MOCKUP_FILES_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        removal: m.kind === "order" ? "hide" : "delete",
        orderStage: m.order
          ? {
              stage: m.order.stage,
              label: ORDER_STAGE_LABELS[m.order.stage],
              description: ORDER_STAGE_DESCRIPTIONS[m.order.stage],
              updatedAt: m.order.stageAt.toISOString(),
            }
          : null,
        order: m.order
          ? {
              id: m.order.id,
              itemCount: counts.get(m.order.id) ?? 1,
              quoteCents: m.order.quoteCents,
              paidAt: m.order.paidAt?.toISOString() ?? null,
              payPath: m.order.quoteCents != null && !m.order.paidAt ? `/pay/${m.order.id}` : null,
            }
          : null,
        canResend: m.kind === "mockup" && !mockupFilesExpired(m.kind, m.createdAt),
        canReorder: m.kind === "order",
        restorePath: `/design?mockup=${m.id}`,
      };
    }),
  );
  return NextResponse.json({ ok: true, items }, { headers: { "cache-control": "no-store" } });
}
