import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { fail } from "@/lib/auth/route-helpers";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import type { GarmentId } from "@/lib/garments";
import { mockupSummary } from "@/lib/mockup-summary";
import { getStorage } from "@/lib/storage";

export type AccountMockup = {
  id: string;
  kind: "mockup" | "order";
  garmentName: string;
  createdAt: string;
  status: string;
  colors: { label: string; name: string; hex: string }[];
  sizes: string[];
  views: { view: string; area: string; imageUrl: string | null }[];
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
    .where(eq(schema.mockups.userId, user.id))
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
          m.views.map(async (v, i) => ({
            view: viewRows[i]!.view,
            area: viewRows[i]!.area,
            imageUrl: await storage.signedUrl(v.mockupKey, 60 * 60).catch(() => null),
          })),
        ),
        restorePath: `/design?mockup=${m.id}`,
      };
    }),
  );
  return NextResponse.json({ ok: true, items }, { headers: { "cache-control": "no-store" } });
}
