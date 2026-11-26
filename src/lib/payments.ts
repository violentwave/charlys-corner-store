import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { PaymentReceivedCustomerEmail } from "@/emails/payment-received-customer";
import { PaymentReceivedOwnerEmail } from "@/emails/payment-received-owner";
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

export type OrderRow = { mockup: typeof schema.mockups.$inferSelect; lead: typeof schema.leads.$inferSelect };

/** The order request + its lead, or null when it isn't a quoted order request. */
export async function loadQuotedOrder(db: Db, id: string): Promise<OrderRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ mockup: schema.mockups, lead: schema.leads })
    .from(schema.mockups)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.mockups.leadId))
    .where(eq(schema.mockups.id, id));
  return row && row.mockup.kind === "order" && row.mockup.quoteCents != null ? row : null;
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
  const subtotalCents = row.mockup.quoteCents!;
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

export const lineItemName = (row: OrderRow) =>
  `Custom order · ${getGarment(row.mockup.garment as GarmentId).name} · #${row.mockup.id.slice(0, 8)}`;
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
    await tx.update(schema.mockups).set({ paidAt: now }).where(eq(schema.mockups.id, pay.mockupId));
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
    let unlocked = false;
    if (Number(rows[0]?.n ?? 0) === 1) {
      const changed = await tx
        .update(schema.coupons)
        .set({ status: "eligible" })
        .where(and(eq(schema.coupons.leadId, pay.leadId), eq(schema.coupons.status, "issued")))
        .returning({ id: schema.coupons.id });
      unlocked = changed.length > 0;
    }
    const [mockup] = await tx.select().from(schema.mockups).where(eq(schema.mockups.id, pay.mockupId));
    return { pay, lead: lead!, mockup: mockup!, unlocked };
  });
  if (!result) return false;

  // Row first, email second: an email failure never undoes (or retries) the payment.
  const garmentName = getGarment(result.mockup.garment as GarmentId).name;
  await sendAccountEmail(
    result.lead.email,
    `Payment received · ${garmentName} 🐾`,
    PaymentReceivedCustomerEmail({
      garmentName,
      amountCents: result.pay.amountCents,
      unlockedCoupon: result.unlocked,
    }),
  ).catch(() => undefined);
  await sendAccountEmail(
    ownerInbox(),
    `Paid: $${(result.pay.amountCents / 100).toFixed(2)} · ${garmentName} · #${result.mockup.id.slice(0, 8)}`,
    PaymentReceivedOwnerEmail({ garmentName, amountCents: result.pay.amountCents, mockupId: result.mockup.id }),
  ).catch(() => undefined);
  return true;
}

/** Re-quote: older unpaid links stop working (rows canceled, Square links deleted, best-effort). */
export async function cancelPendingPayments(db: Db, mockupId: string): Promise<void> {
  const canceled = await db
    .update(schema.orderPayments)
    .set({ status: "canceled" })
    .where(and(eq(schema.orderPayments.mockupId, mockupId), inArray(schema.orderPayments.status, ["pending"])))
    .returning({ linkId: schema.orderPayments.squarePaymentLinkId });
  if (!squareConfigured()) return;
  for (const { linkId } of canceled) {
    if (linkId) await deletePaymentLink(linkId).catch(() => false);
  }
}
