import { NextResponse } from "next/server";
import { z } from "zod";

import { verifiedUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getGarment, type GarmentId } from "@/lib/garments";
import { checkCoupon } from "@/lib/coupons";
import { checkPayToken } from "@/lib/order-stage";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";
import { getOrCreateSquareCustomer, squareConfigured, squareBaseUrl } from "@/lib/square";
import { eq } from "drizzle-orm";

const bodySchema = z.object({ cardId: z.string().min(1), t: z.string().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!squareConfigured()) return NextResponse.json({ error: "payments not enabled" }, { status: 503 });

  const db = getDb();
  const rl = await rateLimit(db, {
    key: `pay:${clientIp(await (await import("next/headers")).headers())}`,
    ...LIMITS.pay,
  });
  if (!rl.ok) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  const v = await verifiedUser(db);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  const user = v.user;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const [row] = await db
    .select({ mockup: schema.mockups, lead: schema.leads })
    .from(schema.mockups)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.mockups.leadId))
    .where(eq(schema.mockups.id, id));
  if (!row || row.mockup.kind !== "order" || row.mockup.quoteCents == null) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.mockup.userId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const customerId = await getOrCreateSquareCustomer({ id: user.id, email: user.email });
  if (!customerId) return NextResponse.json({ error: "payments not enabled" }, { status: 503 });

  // verify the card belongs to this customer
  const cardRes = await fetch(`${squareBaseUrl()}/v2/cards/${encodeURIComponent(parsed.data.cardId)}`, {
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
    },
  });
  const cardJson = (await cardRes.json().catch(() => null)) as {
    card?: { customer_id: string; enabled: boolean };
  } | null;
  if (!cardRes.ok || !cardJson?.card || cardJson.card.customer_id !== customerId || cardJson.card.enabled === false) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  const subtotal = row.mockup.quoteCents;
  const { rows: couponRows } = await db.execute<{ id: string; status: string; expires_at: Date | string }>(
    (await import("drizzle-orm"))
      .sql`select id, status, expires_at from coupons where lead_id = ${row.lead.id} order by issued_at desc limit 1`,
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

  const idempotencyKey = (await import("node:crypto")).randomBytes(16).toString("hex");
  const { rows: inserted } = await db.execute<{ id: string }>(
    (await import("drizzle-orm"))
      .sql`insert into order_payments (mockup_id, lead_id, amount_cents, subtotal_cents, discount_cents, coupon_id, method, status, idempotency_key, url)
     values (${id}, ${row.lead.id}, ${total}, ${subtotal}, ${discountCents}, ${couponId}, 'card_on_file', 'pending', ${idempotencyKey}, ${`/pay/${id}`})
     returning id`,
  );
  const paymentRowId = inserted[0].id;

  const garment = getGarment(row.mockup.garment as GarmentId).name;
  const orderRes = await fetch(`${squareBaseUrl()}/v2/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: idempotencyKey + "-order",
      order: {
        location_id: process.env.SQUARE_LOCATION_ID,
        line_items: [
          {
            name: `Custom order · ${garment} · #${id.slice(0, 8)}`,
            quantity: "1",
            base_price_money: { amount: subtotal, currency: "USD" },
          },
        ],
        discounts:
          discountCents > 0
            ? [
                {
                  name: "15% off your 2nd order",
                  scope: "ORDER",
                  amount_money: { amount: discountCents, currency: "USD" },
                  type: "FIXED_AMOUNT",
                },
              ]
            : undefined,
      },
    }),
  });
  const orderJson = (await orderRes.json().catch(() => null)) as {
    order?: { id: string };
    errors?: { detail?: string }[];
  } | null;
  if (!orderRes.ok || !orderJson?.order?.id) {
    await db.execute(
      (await import("drizzle-orm")).sql`update order_payments set status = 'failed' where id = ${paymentRowId}`,
    );
    return NextResponse.json(
      { error: orderJson?.errors?.[0]?.detail ?? "Couldn't create the order." },
      { status: 502 },
    );
  }
  const squareOrderId = orderJson.order.id;
  await db.execute(
    (await import("drizzle-orm"))
      .sql`update order_payments set square_order_id = ${squareOrderId} where id = ${paymentRowId}`,
  );

  const payRes = await fetch(`${squareBaseUrl()}/v2/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: idempotencyKey + "-pay",
      source_id: parsed.data.cardId,
      customer_id: customerId,
      order_id: squareOrderId,
      amount_money: { amount: total, currency: "USD" },
      autocomplete: true,
    }),
  });
  const payJson = (await payRes.json().catch(() => null)) as {
    payment?: { id: string; status: string };
    errors?: { detail?: string; category?: string }[];
  } | null;
  if (!payRes.ok || !payJson?.payment) {
    await db.execute(
      (await import("drizzle-orm")).sql`update order_payments set status = 'failed' where id = ${paymentRowId}`,
    );
    const err = payJson?.errors?.[0];
    const friendly =
      err?.category === "CVV_FAILURE"
        ? "CVV didn't match."
        : err?.category === "ADDRESS_VERIFICATION_FAILURE"
          ? "Address didn't match."
          : "Card declined.";
    return NextResponse.json({ error: friendly }, { status: 402 });
  }
  const squarePaymentId = payJson.payment.id;
  const paymentStatus = payJson.payment.status;

  if (paymentStatus === "COMPLETED") {
    // mark paid (reuse the same logic as the webhook, inline)
    await db.execute(
      (await import("drizzle-orm"))
        .sql`update order_payments set status = 'paid', square_payment_id = ${squarePaymentId}, paid_at = now() where id = ${paymentRowId}`,
    );
    await db.execute(
      (await import("drizzle-orm"))
        .sql`update mockups set paid_at = now(), order_stage = 'quoted', order_stage_at = now() where id = ${id}`,
    );
    if (couponId) {
      await db.execute(
        (await import("drizzle-orm"))
          .sql`update coupons set status = 'redeemed', redeemed_order_ref = ${squarePaymentId} where id = ${couponId}`,
      );
    }
    const { rows: paidCount } = await db.execute<{ n: number }>(
      (await import("drizzle-orm"))
        .sql`select count(*)::int as n from order_payments where lead_id = ${row.lead.id} and status = 'paid'`,
    );
    if (Number(paidCount[0]?.n ?? 0) === 1) {
      await db.execute(
        (await import("drizzle-orm"))
          .sql`update coupons set status = 'eligible' where lead_id = ${row.lead.id} and status = 'issued'`,
      );
    }
    return NextResponse.json({ ok: true, paid: true });
  }

  await db.execute(
    (await import("drizzle-orm"))
      .sql`update order_payments set status = 'failed', square_payment_id = ${squarePaymentId} where id = ${paymentRowId}`,
  );
  return NextResponse.json({ error: "Card declined." }, { status: 402 });
}
