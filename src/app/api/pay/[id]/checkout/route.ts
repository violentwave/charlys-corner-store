import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { checkPayToken } from "@/lib/order-stage";
import { COUPON_LINE, lineItemName, loadQuotedOrder, PAY_ERRORS, priceOrder, type PayErrorCode } from "@/lib/payments";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";
import { createPaymentLink, squareConfigured } from "@/lib/square";

/**
 * Hosted checkout (P51-3): creates (or reuses) a Square payment link for the quoted order.
 * The pay page posts a plain HTML form, so form posts get a 303 to Square (or back to /pay with
 * ?error=); JSON callers get { url }. Amount and coupon come from the DB, never the request.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isForm = !(request.headers.get("content-type") ?? "").includes("application/json");
  let token: string | null = null;
  if (isForm) {
    const form = await request.formData().catch(() => null);
    token = form?.get("t")?.toString() ?? null;
  } else {
    const json = (await request.json().catch(() => ({}))) as { t?: unknown };
    token = typeof json.t === "string" ? json.t : null;
  }
  const back = (error: PayErrorCode, status: number) =>
    isForm
      ? NextResponse.redirect(
          `${site.url.replace(/\/$/, "")}/pay/${id}?${new URLSearchParams({ ...(token ? { t: token } : {}), error })}`,
          303,
        )
      : NextResponse.json({ error: PAY_ERRORS[error] }, { status });

  if (!squareConfigured()) return back("disabled", 503);
  const db = getDb();
  const rl = await rateLimit(db, { key: `pay:${clientIp(await headers())}`, ...LIMITS.pay });
  if (!rl.ok) return back("busy", 429);

  const row = await loadQuotedOrder(db, id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const user = await currentUser(db);
  const isOwner = Boolean(user && row.mockup.userId === user.id);
  if (!isOwner && !checkPayToken(id, token)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.mockup.paidAt) return back("paid", 409);

  const pricing = await priceOrder(db, row);

  // Reuse the newest still-pending link for the same amount instead of making another.
  const [pending] = await db
    .select()
    .from(schema.orderPayments)
    .where(
      and(
        eq(schema.orderPayments.mockupId, id),
        eq(schema.orderPayments.method, "payment_link"),
        eq(schema.orderPayments.status, "pending"),
      ),
    )
    .orderBy(desc(schema.orderPayments.createdAt))
    .limit(1);
  let url = pending && pending.amountCents === pricing.totalCents ? pending.url : null;

  if (!url) {
    const idempotencyKey = randomBytes(16).toString("hex");
    let link;
    try {
      link = await createPaymentLink({
        idempotencyKey,
        name: lineItemName(row),
        subtotalCents: pricing.subtotalCents,
        discountCents: pricing.discountCents,
        discountLabel: COUPON_LINE,
        buyerEmail: row.lead.email,
        redirectUrl: `${site.url.replace(/\/$/, "")}/pay/${id}/done${token ? `?t=${encodeURIComponent(token)}` : ""}`,
      });
    } catch {
      return back("square", 502);
    }
    await db.insert(schema.orderPayments).values({
      mockupId: id,
      leadId: row.lead.id,
      amountCents: pricing.totalCents,
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      couponId: pricing.discountCents > 0 ? pricing.coupon!.id : null,
      method: "payment_link",
      status: "pending",
      idempotencyKey,
      squarePaymentLinkId: link.id,
      squareOrderId: link.orderId,
      url: link.url,
    });
    url = link.url;
  }

  return isForm ? NextResponse.redirect(url, 303) : NextResponse.json({ url });
}
