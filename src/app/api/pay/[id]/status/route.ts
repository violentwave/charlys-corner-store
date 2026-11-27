import { desc, eq } from "drizzle-orm";
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
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!order || order.quoteCents == null) return NextResponse.json({ status: "not_found" }, { status: 404 });
  const user = await currentUser(db);
  const isOwner = Boolean(user && order.userId === user.id);
  if (!isOwner && !checkPayToken(id, token)) return NextResponse.json({ status: "not_found" }, { status: 404 });
  if (order.paidAt) return NextResponse.json({ status: "paid", paidAt: order.paidAt.toISOString() });
  const [last] = await db
    .select({ status: schema.orderPayments.status, paidAt: schema.orderPayments.paidAt })
    .from(schema.orderPayments)
    .where(eq(schema.orderPayments.orderId, id))
    .orderBy(desc(schema.orderPayments.createdAt))
    .limit(1);
  return NextResponse.json({ status: last?.status ?? "none", paidAt: last?.paidAt?.toISOString() ?? null });
}
