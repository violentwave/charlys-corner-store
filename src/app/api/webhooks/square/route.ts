import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { PaymentReceivedCustomerEmail } from "@/emails/payment-received-customer";
import { PaymentReceivedOwnerEmail } from "@/emails/payment-received-owner";
import { getDb, schema } from "@/lib/db";
import { sendAccountEmail } from "@/lib/notify";
import { site } from "@/lib/site";
import { verifySquareSignature } from "@/lib/square";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");
  const url = process.env.SQUARE_WEBHOOK_URL || `${site.url.replace(/\/$/, "")}/api/webhooks/square`;
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
  if (!verifySquareSignature(rawBody, signature, url, key)) {
    return new NextResponse(null, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 200 });
  }
  const e = event as {
    event_id?: string;
    eventId?: string;
    type?: string;
    data?: { object?: { payment?: { id?: string; status?: string; order_id?: string } } };
  };
  const eventId = e?.event_id ?? e?.eventId;
  const type = e?.type ?? "";
  if (!eventId) return new NextResponse(null, { status: 200 });

  const db = getDb();
  // dedupe
  const { rows: existing } = await db.execute<{ event_id: string }>(
    (await import("drizzle-orm")).sql`select event_id from webhook_events where event_id = ${eventId}`,
  );
  if (existing.length > 0) return new NextResponse(null, { status: 200 });
  await db.execute(
    (await import("drizzle-orm"))
      .sql`insert into webhook_events (event_id, type) values (${eventId}, ${type}) on conflict do nothing`,
  );

  // Only payments interest us.
  if (type !== "payment.created" && type !== "payment.updated") {
    return new NextResponse(null, { status: 200 });
  }

  const payment = e?.data?.object?.payment;
  const paymentStatus = payment?.status; // COMPLETED, FAILED, CANCELED
  const squarePaymentId = payment?.id;
  const squareOrderId = payment?.order_id;

  if (!squareOrderId) return new NextResponse(null, { status: 200 });

  const { rows: payRows } = await db.execute<{
    id: string;
    mockup_id: string;
    lead_id: string;
    coupon_id: string | null;
    amount_cents: number;
    status: string;
  }>(
    (await import("drizzle-orm"))
      .sql`select id, mockup_id, lead_id, coupon_id, amount_cents, status from order_payments where square_order_id = ${squareOrderId} limit 1`,
  );
  const pay = payRows[0];
  if (!pay) return new NextResponse(null, { status: 200 });

  try {
    if (paymentStatus === "COMPLETED") {
      if (pay.status === "paid") return new NextResponse(null, { status: 200 }); // already handled
      // transactional update
      await db.transaction(async (tx) => {
        await tx
          .update(schema.orderPayments)
          .set({ status: "paid", squarePaymentId: squarePaymentId ?? null, paidAt: new Date() })
          .where(eq(schema.orderPayments.id, pay.id));
        await tx
          .update(schema.mockups)
          .set({ paidAt: new Date(), orderStage: "quoted", orderStageAt: new Date() })
          .where(eq(schema.mockups.id, pay.mockup_id));
        if (pay.coupon_id) {
          await tx
            .update(schema.coupons)
            .set({ status: "redeemed", redeemedOrderRef: squarePaymentId ?? pay.id })
            .where(eq(schema.coupons.id, pay.coupon_id));
        }
      });
      // unlock the lead's coupon (issued -> eligible) if this is their first paid order
      const { rows: paidCount } = await db.execute<{ n: number }>(
        (await import("drizzle-orm"))
          .sql`select count(*)::int as n from order_payments where lead_id = ${pay.lead_id} and status = 'paid'`,
      );
      const firstPaid = Number(paidCount[0]?.n ?? 0) === 1;
      if (firstPaid) {
        await db.execute(
          (await import("drizzle-orm"))
            .sql`update coupons set status = 'eligible' where lead_id = ${pay.lead_id} and status = 'issued'`,
        );
      }
      // emails (row first, email second — never throw 500 for email failures)
      try {
        const [mockupRow] = await db
          .select({ mockup: schema.mockups, lead: schema.leads })
          .from(schema.mockups)
          .innerJoin(schema.leads, eq(schema.leads.id, schema.mockups.leadId))
          .where(eq(schema.mockups.id, pay.mockup_id));
        const garment = mockupRow?.mockup.garment ?? "order";
        const leadEmail = mockupRow?.lead.email ?? "";
        await sendAccountEmail(
          leadEmail,
          `Payment received — ${garment} 🐾`,
          PaymentReceivedCustomerEmail({
            garmentName: garment,
            amountCents: pay.amount_cents,
            unlockedCoupon: firstPaid,
          }),
        );
        await sendAccountEmail(
          process.env.OWNER_NOTIFY_EMAIL ?? "CHARLYSCORNERSTORE@GMAIL.COM",
          `Paid: $${(pay.amount_cents / 100).toFixed(2)}`,
          PaymentReceivedOwnerEmail({ garmentName: garment, amountCents: pay.amount_cents, mockupId: pay.mockup_id }),
        );
      } catch {
        // swallow
      }
    } else if (paymentStatus === "FAILED") {
      await db.update(schema.orderPayments).set({ status: "failed" }).where(eq(schema.orderPayments.id, pay.id));
    } else if (paymentStatus === "CANCELED") {
      await db.update(schema.orderPayments).set({ status: "canceled" }).where(eq(schema.orderPayments.id, pay.id));
    }
  } catch {
    // swallow — never 500 back to Square
  }

  return new NextResponse(null, { status: 200 });
}
