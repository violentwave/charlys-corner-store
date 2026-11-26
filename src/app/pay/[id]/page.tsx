import { currentUser } from "@/lib/auth/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb, schema } from "@/lib/db";
import { getGarment, type GarmentId } from "@/lib/garments";
import { checkCoupon } from "@/lib/coupons";
import { checkPayToken } from "@/lib/order-stage";
import { squareConfigured } from "@/lib/square";
import { site } from "@/lib/site";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const metadata: Metadata = { title: "Pay", robots: { index: false, follow: false } };

type LoadResult = {
  id: string;
  token: string | null;
  garment: string;
  subtotal: number;
  note: string | null;
  coupon: { code: string; status: string; expiresAt: Date } | null;
  couponCheck: ReturnType<typeof checkCoupon> | { ok: false; reason: "no_coupon" };
};

async function load(id: string, token: string | null): Promise<LoadResult | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getDb();
  const [row] = await db
    .select({ mockup: schema.mockups, lead: schema.leads })
    .from(schema.mockups)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.mockups.leadId))
    .where(eq(schema.mockups.id, id));
  if (!row || row.mockup.kind !== "order" || row.mockup.quoteCents == null) return null;
  const user = await currentUser(db);
  const isOwner = Boolean(user && row.mockup.userId === user.id);
  const guestOk = checkPayToken(id, token);
  if (!isOwner && !guestOk) return null;

  const { rows: couponRows } = await db.execute<{ code: string; status: string; expires_at: Date | string }>(
    sql`select code, status, expires_at from coupons where lead_id = ${row.lead.id} order by issued_at desc limit 1`,
  );
  const coupon = couponRows[0]
    ? { code: couponRows[0].code, status: couponRows[0].status, expiresAt: new Date(couponRows[0].expires_at) }
    : null;

  const { rows: paidRows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from order_payments op join mockups m on m.id = op.mockup_id join leads l on l.id = m.lead_id where lower(l.email) = lower(${row.lead.email}) and op.status = 'paid'`,
  );
  const completedOrders = Number(paidRows[0]?.n ?? 0);

  const subtotal = row.mockup.quoteCents;
  let couponCheck: ReturnType<typeof checkCoupon> | { ok: false; reason: "no_coupon" };
  if (coupon) {
    couponCheck = checkCoupon({
      status: coupon.status as "issued" | "eligible" | "redeemed" | "expired",
      expiresAt: coupon.expiresAt,
      completedOrdersForEmail: completedOrders,
      subtotalCents: subtotal,
    });
  } else {
    couponCheck = { ok: false, reason: "no_coupon" as const };
  }

  return {
    id,
    token,
    garment: getGarment(row.mockup.garment as GarmentId).name,
    subtotal,
    note: row.mockup.quoteNote,
    coupon,
    couponCheck,
  };
}

function couponReason(c: { ok: false; reason: string }): string {
  if (c.reason === "below_minimum") return "below the $30 minimum";
  if (c.reason === "no_first_order" || c.reason === "no_coupon") return "unlocks after your first paid order";
  if (c.reason === "redeemed") return "already used";
  if (c.reason === "expired") return "expired";
  return "not available";
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const data = await load(id, sp.t ?? null);
  if (!data) notFound();

  const discount = data.couponCheck.ok ? (data.couponCheck as { discountCents: number }).discountCents : 0;
  const total = data.subtotal - discount;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="font-heading text-text-1 text-2xl tracking-wide uppercase">Pay for your order</h1>
      <p className="text-text-2 mt-2">
        {data.garment} · #{id.slice(0, 8)}
      </p>
      {data.note ? <p className="text-text-2 mt-4">{data.note}</p> : null}
      <div className="border-border bg-bg-2 mt-6 rounded-2xl border p-4">
        <div className="flex justify-between">
          <span className="text-text-2">Subtotal</span>
          <span className="text-text-1 font-mono">${(data.subtotal / 100).toFixed(2)}</span>
        </div>
        {data.coupon ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-text-2">15% coupon ({data.coupon.code})</span>
            {data.couponCheck.ok ? (
              <span className="text-neon-green font-mono">−${(discount / 100).toFixed(2)}</span>
            ) : (
              <span className="text-text-3 text-xs">
                {couponReason(data.couponCheck as { ok: false; reason: string })}
              </span>
            )}
          </div>
        ) : null}
        <div className="border-border mt-3 flex justify-between border-t pt-3">
          <span className="text-text-1 font-semibold">Total</span>
          <span className="text-neon-yellow font-mono text-xl">${(total / 100).toFixed(2)}</span>
        </div>
      </div>
      {!squareConfigured() ? (
        <p className="text-text-2 mt-6">Payments aren&apos;t enabled yet — we&apos;ll send payment details shortly.</p>
      ) : (
        <form action={`/api/pay/${id}/checkout`} method="post" className="mt-6">
          {data.token ? <input type="hidden" name="t" value={data.token} /> : null}
          <button
            type="submit"
            className="bg-neon-pink text-bg-0 shadow-glow-pink rounded-full px-6 py-3 text-sm font-semibold"
          >
            Pay ${(total / 100).toFixed(2)} securely with Square
          </button>
        </form>
      )}
      <p className="text-text-3 mt-4 text-xs">Pay by card, Apple Pay, Google Pay, Cash App Pay or Afterpay.</p>
      <Link href="/" className="text-neon-cyan mt-6 inline-block text-sm">
        Back home
      </Link>
    </main>
  );
}
