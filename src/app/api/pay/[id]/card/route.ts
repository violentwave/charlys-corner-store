import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifiedUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { COUPON_LINE, lineItemName, loadQuotedOrder, markOrderPaid, priceOrder } from "@/lib/payments";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import {
  createCardPayment,
  createOrder,
  existingSquareCustomerId,
  getOwnedCard,
  squareConfigured,
  type SquareError,
} from "@/lib/square";

const bodySchema = z.object({ cardId: z.string().min(1).max(200) });

const DECLINE_MESSAGES: Record<string, string> = {
  CVV_FAILURE: "The security code (CVV) didn't match.",
  ADDRESS_VERIFICATION_FAILURE: "The ZIP code didn't match the card.",
  INVALID_EXPIRATION: "The card is expired.",
  INSUFFICIENT_FUNDS: "The card was declined for insufficient funds.",
  GENERIC_DECLINE: "The card was declined.",
};
const declineMessage = (e?: SquareError) => (e?.code && DECLINE_MESSAGES[e.code]) || "The card was declined.";

/**
 * Pay with a saved card (P51-4), members only. Charges the member's own card on file for the
 * quoted amount (server-side pricing). A partial unique index allows one card charge in flight
 * per order, so a double click can't charge twice; a paid order can't be charged again.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!squareConfigured())
    return NextResponse.json({ error: "Online payment isn't switched on yet." }, { status: 503 });

  const db = getDb();
  const rl = await rateLimit(db, { key: `pay:${clientIp(await headers())}`, ...LIMITS.pay });
  if (!rl.ok) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });

  const v = await verifiedUser(db);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a card." }, { status: 400 });

  const row = await loadQuotedOrder(db, id);
  if (!row || row.order.userId !== v.user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.order.paidAt) return NextResponse.json({ error: "This order is already paid." }, { status: 409 });

  const customerId = await existingSquareCustomerId(v.user.id);
  const card = customerId ? await getOwnedCard(parsed.data.cardId, customerId) : null;
  if (!customerId || !card) return NextResponse.json({ error: "That card isn't on your account." }, { status: 404 });

  const pricing = await priceOrder(db, row);
  const idempotencyKey = randomBytes(16).toString("hex");
  let paymentRowId: string;
  try {
    const [inserted] = await db
      .insert(schema.orderPayments)
      .values({
        orderId: id,
        leadId: row.lead.id,
        amountCents: pricing.totalCents,
        subtotalCents: pricing.subtotalCents,
        discountCents: pricing.discountCents,
        couponId: pricing.discountCents > 0 ? pricing.coupon!.id : null,
        method: "card_on_file",
        status: "pending",
        idempotencyKey,
        url: `/pay/${id}`,
      })
      .returning({ id: schema.orderPayments.id });
    paymentRowId = inserted!.id;
  } catch {
    // order_payments_one_card_in_flight: another charge for this order is still running.
    return NextResponse.json({ error: "A payment for this order is already in progress." }, { status: 409 });
  }
  const fail = async (error: string, status: number) => {
    await db.update(schema.orderPayments).set({ status: "failed" }).where(eq(schema.orderPayments.id, paymentRowId));
    return NextResponse.json({ error }, { status });
  };

  const order = await createOrder({
    idempotencyKey: `${idempotencyKey}-order`,
    name: lineItemName(row),
    subtotalCents: pricing.subtotalCents,
    discountCents: pricing.discountCents,
    discountLabel: COUPON_LINE,
  }).catch(() => ({ ok: false as const, error: "Square didn't answer." }));
  if (!order.ok) return fail("Square didn't answer. Please try again in a minute.", 502);
  await db
    .update(schema.orderPayments)
    .set({ squareOrderId: order.orderId })
    .where(eq(schema.orderPayments.id, paymentRowId));

  const payment = await createCardPayment({
    idempotencyKey: `${idempotencyKey}-pay`,
    cardId: card.id,
    customerId,
    orderId: order.orderId,
    amountCents: pricing.totalCents,
  }).catch(() => null);
  if (!payment) {
    // Unknown outcome (network): leave it pending; the webhook settles it either way.
    return NextResponse.json({ ok: true, paid: false, pending: true });
  }
  if (!payment.ok) return fail(declineMessage(payment.error), 402);

  if (payment.status === "COMPLETED") {
    await markOrderPaid(db, { paymentRowId }, payment.paymentId);
    return NextResponse.json({ ok: true, paid: true });
  }
  if (payment.status === "FAILED" || payment.status === "CANCELED") return fail("The card was declined.", 402);
  // APPROVED / PENDING: Square is still working on it; the webhook marks it paid.
  await db
    .update(schema.orderPayments)
    .set({ squarePaymentId: payment.paymentId })
    .where(and(eq(schema.orderPayments.id, paymentRowId), eq(schema.orderPayments.status, "pending")));
  return NextResponse.json({ ok: true, paid: false, pending: true });
}
