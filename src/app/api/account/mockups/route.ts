import { and, desc, eq, isNull } from "drizzle-orm";
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

  const rows = await db
    .select()
    .from(schema.mockups)
    .where(and(eq(schema.mockups.userId, user.id), isNull(schema.mockups.hiddenByUserAt)))
    .orderBy(desc(schema.mockups.createdAt))
    .limit(50);

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
        orderStage:
          m.kind === "order"
            ? {
                stage: (m.orderStage ?? "received") as OrderStage,
                label: ORDER_STAGE_LABELS[(m.orderStage ?? "received") as OrderStage],
                description: ORDER_STAGE_DESCRIPTIONS[(m.orderStage ?? "received") as OrderStage],
                updatedAt: (m.orderStageAt ?? m.createdAt).toISOString(),
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
