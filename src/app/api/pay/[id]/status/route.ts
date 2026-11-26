import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { checkPayToken } from "@/lib/order-stage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ status: "not_found" }, { status: 404 });
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const db = getDb();
  const [row] = await db.select({ mockup: schema.mockups }).from(schema.mockups).where(eq(schema.mockups.id, id));
  if (!row || row.mockup.kind !== "order" || row.mockup.quoteCents == null) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
  const user = await currentUser(db);
  const isOwner = Boolean(user && row.mockup.userId === user.id);
  if (!isOwner && !checkPayToken(id, token)) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
  const { rows } = await db.execute<{ status: string; paid_at: Date | string | null }>(
    (await import("drizzle-orm"))
      .sql`select status, paid_at from order_payments where mockup_id = ${id} order by created_at desc limit 1`,
  );
  const r = rows[0];
  return NextResponse.json({
    status: r?.status ?? "none",
    paidAt: r?.paid_at ? new Date(r.paid_at).toISOString() : null,
  });
}
