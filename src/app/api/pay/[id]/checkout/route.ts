import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getGarment, type GarmentId } from "@/lib/garments";
import { checkCoupon } from "@/lib/coupons";
import { checkPayToken } from "@/lib/order-stage";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";
import { createPaymentLink, squareConfigured } from "@/lib/square";
import { randomBytes } from "node:crypto";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!squareConfigured()) return NextResponse.json({ error: "payments not enabled" }, { status: 503 });

  const db = getDb();
  const rl = await rateLimit(db, { key: `pay:${clientIp(await headers())}`, ...LIMITS.pay });
  if (!rl.ok) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  let token: string | null = null;
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const json = await request.json().catch(() => ({}));
    token = typeof json?.t === "string" ? json.t : null;
  } else {
    const form = await request.formData().catch(() => null);
    token = form ? (form.get("t")?.toString() ?? null) : null;
  }

  const [row] = await db
    .select({ mockup: schema.mockups, lead: schema.leads })
    .from(schema.mockups)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.mockups.leadId))
    .where(eq(schema.mockups.id, id));
  if (!row || row.mockup.kind !== "order" || row.mockup.quoteCents == null) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const user = await currentUser(db);
  const isOwner = Boolean(user && row.mockup.userId === user.id);
  const guestOk = checkPayToken(id, token);
  if (!isOwner && !guestOk) return NextResponse.json({ error: "not found" }, { status: 404 });

  const subtotal = row.mockup.quoteCents;

  // Coupon eligibility (server-side, never trust the client).
  const { rows: couponRows } = await db.execute<{
    id: string;
    code: string;
    status: string;
    expires_at: Date | string;
  }>(
    (await import("drizzle-orm"))
      .sql`select id, code, status, expires_at from coupons where lead_id = ${row.lead.id} order by issued_at desc limit 1`,
  );
  const coupon = couponRows[0] ?? null;
  const { rows: paidRows } = await db.execute<{ n: number }>(
    (await import("drizzle-orm"))
      .sql`select count(*)::int as n from order_payments op join mockups m on m.id = op.mockup_id join leads l on l.id = m.lead_id where lower(l.email) = lower(${row.lead.email}) and op.status = 'paid'`,
  );
  const completedOrders = Number(paidRows[0]?.n ?? 0);

  let discountCents = 0;
  let couponId: string | null = null;
  if (coupon) {
    const res = checkCoupon({
      status: coupon.status as "issued" | "eligible" | "redeemed" | "expired",
      expiresAt: new Date(coupon.expires_at),
      completedOrdersForEmail: completedOrders,
      subtotalCents: subtotal,
    });
    if (res.ok) {
      discountCents = res.discountCents;
      couponId = coupon.id;
    }
  }
  const total = subtotal - discountCents;

  // Reuse a still-pending link for the same amount instead of creating a new one.
  const { rows: existing } = await db.execute<{
    id: string;
    url: string;
    square_order_id: string | null;
    amount_cents: number;
    status: string;
  }>(
    (await import("drizzle-orm"))
      .sql`select id, url, square_order_id, amount_cents, status from order_payments where mockup_id = ${id} and status = 'pending' order by created_at desc limit 1`,
  );
  let paymentRow = existing[0] && existing[0].amount_cents === total ? existing[0] : null;

  if (!paymentRow) {
    const idempotencyKey = randomBytes(16).toString("hex");
    const garment = getGarment(row.mockup.garment as GarmentId).name;
    const link = await createPaymentLink({
      idempotencyKey,
      name: `Custom order · ${garment} · #${id.slice(0, 8)}`,
      subtotalCents: subtotal,
      discountCents,
      discountLabel: coupon ? "15% off your 2nd order" : undefined,
      buyerEmail: row.lead.email,
      redirectUrl: `${site.url.replace(/\/$/, "")}/pay/${id}/done`,
    });
    const { rows: inserted } = await db.execute<{ id: string }>(
      (await import("drizzle-orm"))
        .sql`insert into order_payments (mockup_id, lead_id, amount_cents, subtotal_cents, discount_cents, coupon_id, method, status, idempotency_key, square_payment_link_id, square_order_id, url)
       values (${id}, ${row.lead.id}, ${total}, ${subtotal}, ${discountCents}, ${couponId}, 'payment_link', 'pending', ${idempotencyKey}, ${link.id}, ${link.orderId}, ${link.url})
       returning id`,
    );
    paymentRow = {
      id: inserted[0].id,
      url: link.url,
      square_order_id: link.orderId,
      amount_cents: total,
      status: "pending",
    };
  }

  return NextResponse.json({ url: paymentRow.url });
}
