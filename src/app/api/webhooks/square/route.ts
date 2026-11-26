import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { markOrderPaid } from "@/lib/payments";
import { site } from "@/lib/site";
import { verifySquareSignature } from "@/lib/square";

/**
 * Square webhook (P51-3): payment.created / payment.updated.
 * - Signature first (401 otherwise). SQUARE_WEBHOOK_URL must equal the subscription URL exactly.
 * - Dedupe by event_id, but only *after* the event was handled: if handling fails we answer 500
 *   and forget the event id, so Square's retry gets another go (a lost "paid" is worse than a retry).
 * - markOrderPaid is idempotent, so payment.created + payment.updated (both COMPLETED) or a race
 *   with the pay-with-card route mark the order paid and email once.
 */
type PaymentEvent = {
  event_id?: string;
  type?: string;
  data?: { object?: { payment?: { id?: string; status?: string; order_id?: string } } };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const url = process.env.SQUARE_WEBHOOK_URL || `${site.url.replace(/\/$/, "")}/api/webhooks/square`;
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
  if (!verifySquareSignature(rawBody, request.headers.get("x-square-hmacsha256-signature"), url, key)) {
    return new NextResponse(null, { status: 401 });
  }

  let event: PaymentEvent;
  try {
    event = JSON.parse(rawBody) as PaymentEvent;
  } catch {
    return new NextResponse(null, { status: 200 });
  }
  const eventId = event.event_id;
  const type = event.type ?? "";
  if (!eventId) return new NextResponse(null, { status: 200 });

  const db = getDb();
  const claimed = await db
    .insert(schema.webhookEvents)
    .values({ eventId, type })
    .onConflictDoNothing()
    .returning({ eventId: schema.webhookEvents.eventId });
  if (claimed.length === 0) return new NextResponse(null, { status: 200 }); // already handled

  try {
    const payment = event.data?.object?.payment;
    if ((type === "payment.created" || type === "payment.updated") && payment?.order_id) {
      if (payment.status === "COMPLETED") {
        await markOrderPaid(db, { squareOrderId: payment.order_id }, payment.id ?? null);
      } else if (payment.status === "FAILED" || payment.status === "CANCELED") {
        await db
          .update(schema.orderPayments)
          .set({ status: payment.status === "FAILED" ? "failed" : "canceled" })
          .where(
            and(
              eq(schema.orderPayments.squareOrderId, payment.order_id),
              sql`${schema.orderPayments.status} = 'pending'`,
            ),
          );
      }
    }
  } catch (err) {
    console.error("square webhook: handling failed, asking Square to retry", err instanceof Error ? err.message : "");
    await db
      .delete(schema.webhookEvents)
      .where(eq(schema.webhookEvents.eventId, eventId))
      .catch(() => undefined);
    return new NextResponse(null, { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
