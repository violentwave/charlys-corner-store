import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { PaymentReceivedCustomerEmail } from "@/emails/payment-received-customer";
import { PaymentReceivedOwnerEmail } from "@/emails/payment-received-owner";
import { issueCoupon } from "@/lib/coupon-store";
import { checkCoupon, type CouponCheckResult, type CouponStatus } from "@/lib/coupons";
import { schema, type Db } from "@/lib/db";
import { ownerInbox } from "@/lib/email";
import { getGarment, type GarmentId } from "@/lib/garments";
import { sendAccountEmail } from "@/lib/notify";
import { deletePaymentLink, squareConfigured } from "@/lib/square";

/**
 * Custom-order payments (P51-3/4): pricing, "mark paid" and re-quote cleanup, shared by the
 * pay page, hosted checkout, pay-with-saved-card and the Square webhook so they can't drift.
 * Amounts are integer cents and always come from the DB (the owner's quote), never the client.
 */

export type OrderRow = {
  order: typeof schema.orders.$inferSelect;
  lead: typeof schema.leads.$inferSelect;
  /** The order's designs, oldest first (always at least one). */
  items: (typeof schema.mockups.$inferSelect)[];
};

const UUID = /^[0-9a-f-]{36}$/i;

/** An order with its lead and items, or null. */
export async function loadOrder(db: Db, id: string): Promise<OrderRow | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({ order: schema.orders, lead: schema.leads })
    .from(schema.orders)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.orders.leadId))
    .where(eq(schema.orders.id, id));
  if (!row) return null;
  const items = await db
    .select()
    .from(schema.mockups)
    .where(eq(schema.mockups.orderId, id))
    .orderBy(asc(schema.mockups.createdAt), asc(schema.mockups.id));
  return items.length ? { ...row, items } : null;
}

/** The order + lead + items, or null when it isn't priced yet. */
export async function loadQuotedOrder(db: Db, id: string): Promise<OrderRow | null> {
  const row = await loadOrder(db, id);
  return row && row.order.quoteCents != null ? row : null;
}

/** "Classic tee" for one design, "Classic tee + 2 more" for several (emails, Square, pages). */
export function orderTitle(items: { garment: string }[]): string {
  const first = getGarment(items[0]!.garment as GarmentId).name;
  return items.length > 1 ? `${first} + ${items.length - 1} more` : first;
}

export type Pricing = {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  coupon: { id: string; code: string } | null;
  /** Why the coupon doesn't apply (null when it does or there's no coupon). */
  couponCheck: CouponCheckResult | null;
};

/** Paid custom orders for this email (the coupon unlocks after the first one). */
async function paidOrdersForEmail(db: Db, email: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from order_payments op join leads l on l.id = op.lead_id
        where lower(l.email) = lower(${email}) and op.status = 'paid'`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function priceOrder(db: Db, row: OrderRow): Promise<Pricing> {
  const subtotalCents = row.order.quoteCents!;
  const [coupon] = await db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.leadId, row.lead.id))
    .orderBy(sql`issued_at desc`)
    .limit(1);
  if (!coupon) return { subtotalCents, discountCents: 0, totalCents: subtotalCents, coupon: null, couponCheck: null };
  const check = checkCoupon({
    status: coupon.status as CouponStatus,
    expiresAt: coupon.expiresAt,
    completedOrdersForEmail: await paidOrdersForEmail(db, row.lead.email),
    subtotalCents,
  });
  const discountCents = check.ok ? check.discountCents : 0;
  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    coupon: { id: coupon.id, code: coupon.code },
    couponCheck: check,
  };
}

/** Errors the checkout route sends back to /pay as ?error=<code> (never free text in the URL). */
export const PAY_ERRORS = {
  disabled: "Online payment isn't switched on yet.",
  busy: "Too many tries. Please wait a few minutes.",
  paid: "This order is already paid.",
  square: "Square didn't answer. Please try again in a minute.",
} as const;
export type PayErrorCode = keyof typeof PAY_ERRORS;

export const lineItemName = (row: OrderRow) => `Custom order · ${orderTitle(row.items)} · #${row.order.id.slice(0, 8)}`;
export const COUPON_LINE = "15% off your 2nd order";

/**
 * Marks one order_payments row paid, once. The conditional update (`status <> 'paid'`) makes
 * this safe when the webhook and the card route (or two webhook events) race: only the call
 * that flips the row sends emails. A row canceled by a re-quote still counts: money arrived.
 * Returns false when the row was already paid (or doesn't exist).
 */
export async function markOrderPaid(
  db: Db,
  match: { paymentRowId: string } | { squareOrderId: string },
  squarePaymentId: string | null,
): Promise<boolean> {
  const where =
    "paymentRowId" in match
      ? eq(schema.orderPayments.id, match.paymentRowId)
      : eq(schema.orderPayments.squareOrderId, match.squareOrderId);
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [pay] = await tx
      .update(schema.orderPayments)
      .set({ status: "paid", squarePaymentId, paidAt: now })
      .where(and(where, sql`${schema.orderPayments.status} <> 'paid'`))
      .returning();
    if (!pay) return null;
    await tx.update(schema.orders).set({ paidAt: now }).where(eq(schema.orders.id, pay.orderId));
    if (pay.couponId) {
      await tx
        .update(schema.coupons)
        .set({ status: "redeemed", redeemedOrderRef: squarePaymentId ?? pay.id })
        .where(eq(schema.coupons.id, pay.couponId));
    }
    // First paid order for this email → the 15% coupon unlocks.
    const [lead] = await tx.select().from(schema.leads).where(eq(schema.leads.id, pay.leadId));
    const { rows } = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from order_payments op join leads l on l.id = op.lead_id
          where lower(l.email) = lower(${lead!.email}) and op.status = 'paid'`,
    );
    const firstPaid = Number(rows[0]?.n ?? 0) === 1;
    const items = await tx
      .select({ garment: schema.mockups.garment })
      .from(schema.mockups)
      .where(eq(schema.mockups.orderId, pay.orderId))
      .orderBy(asc(schema.mockups.createdAt), asc(schema.mockups.id));
    return { pay, lead: lead!, items, firstPaid };
  });
  if (!result) return false;

  // First paid order → the customer's one 15% coupon is created (or an older, pre-2026-11-26
  // one unlocked) and emailed. issueCoupon is idempotent per lead: one coupon per customer.
  let coupon: { code: string; expiresAt: Date } | null = null;
  if (result.firstPaid) {
    try {
      const issued = await issueCoupon(db, result.lead.id);
      await db
        .update(schema.coupons)
        .set({ status: "eligible" })
        .where(and(eq(schema.coupons.id, issued.id), eq(schema.coupons.status, "issued")));
      coupon = { code: issued.code, expiresAt: issued.expiresAt };
    } catch {
      console.error("coupon issue after first payment failed", { leadId: result.lead.id });
    }
  }

  // Row first, email second: an email failure never undoes (or retries) the payment.
  const garmentName = result.items.length ? orderTitle(result.items) : "Custom order";
  await sendAccountEmail(
    result.lead.email,
    `Payment received · ${garmentName} 🐾`,
    PaymentReceivedCustomerEmail({
      garmentName,
      amountCents: result.pay.amountCents,
      coupon,
    }),
  ).catch(() => undefined);
  await sendAccountEmail(
    ownerInbox(),
    `Paid: $${(result.pay.amountCents / 100).toFixed(2)} · ${garmentName} · #${result.pay.orderId.slice(0, 8)}`,
    PaymentReceivedOwnerEmail({ garmentName, amountCents: result.pay.amountCents, mockupId: result.pay.orderId }),
  ).catch(() => undefined);
  return true;
}

/** Re-quote: older unpaid links stop working (rows canceled, Square links deleted, best-effort). */
export async function cancelPendingPayments(db: Db, orderId: string): Promise<void> {
  const canceled = await db
    .update(schema.orderPayments)
    .set({ status: "canceled" })
    .where(and(eq(schema.orderPayments.orderId, orderId), inArray(schema.orderPayments.status, ["pending"])))
    .returning({ linkId: schema.orderPayments.squarePaymentLinkId });
  if (!squareConfigured()) return;
  for (const { linkId } of canceled) {
    if (linkId) await deletePaymentLink(linkId).catch(() => false);
  }
}
