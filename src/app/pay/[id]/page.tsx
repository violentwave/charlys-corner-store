import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getGarment, type GarmentId } from "@/lib/garments";
import { checkPayToken } from "@/lib/order-stage";
import { loadQuotedOrder, orderTitle, PAY_ERRORS, priceOrder, type PayErrorCode, type Pricing } from "@/lib/payments";
import { existingSquareCustomerId, listCards, squareConfigured, type SavedCard } from "@/lib/square";
import { PageTransition } from "@/components/layout/page-transition";
import { PayWithSavedCard } from "./pay-with-card";

export const metadata: Metadata = { title: "Pay", robots: { index: false, follow: false } };

type LoadResult = {
  id: string;
  token: string | null;
  garment: string;
  items: { id: string; name: string; pieces: number }[];
  note: string | null;
  paidAt: Date | null;
  pricing: Pricing;
  savedCards: SavedCard[];
  isOwner: boolean;
};

async function load(id: string, token: string | null): Promise<LoadResult | null> {
  const db = getDb();
  const row = await loadQuotedOrder(db, id);
  if (!row) return null;
  const user = await currentUser(db);
  const isOwner = Boolean(user && row.order.userId === user.id);
  if (!isOwner && !checkPayToken(id, token)) return null;

  // Saved cards: only for the member who owns the order, and only if they already have a
  // Square customer (viewing this page never creates one).
  let savedCards: SavedCard[] = [];
  if (isOwner && user && squareConfigured() && !row.order.paidAt) {
    const customerId = await existingSquareCustomerId(user.id);
    if (customerId) savedCards = await listCards(customerId).catch(() => []);
  }

  return {
    id,
    token,
    garment: orderTitle(row.items),
    items: row.items.map((m) => ({
      id: m.id,
      name: getGarment(m.garment as GarmentId).name,
      pieces: Object.values(m.sizes).reduce((n, q) => n + (q ?? 0), 0),
    })),
    note: row.order.quoteNote,
    paidAt: row.order.paidAt,
    pricing: await priceOrder(db, row),
    savedCards,
    isOwner,
  };
}

function couponReason(c: { ok: false; reason: string }): string {
  if (c.reason === "below_minimum") return "below the $30 minimum";
  if (c.reason === "no_first_order" || c.reason === "no_coupon") return "unlocks after your first paid order";
  if (c.reason === "redeemed") return "already used";
  if (c.reason === "expired") return "expired";
  return "not available";
}

async function PayGate({ id, token, error }: { id: string; token: string | null; error: string | null }) {
  const data = await load(id, token);
  if (!data) notFound();

  const { subtotalCents, discountCents: discount, totalCents: total, coupon, couponCheck } = data.pricing;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="font-heading text-text-1 text-2xl tracking-wide uppercase">Pay for your order</h1>
      <p className="text-text-2 mt-2">
        {data.garment} · #{id.slice(0, 8)}
      </p>
      {data.items.length > 1 ? (
        <ul className="text-text-2 mt-4 space-y-1 text-sm" data-testid="pay-items">
          {data.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>{item.name}</span>
              <span className="font-mono">{item.pieces} pcs</span>
            </li>
          ))}
        </ul>
      ) : null}
      {data.note ? <p className="text-text-2 mt-4">{data.note}</p> : null}
      <div className="border-border bg-bg-2 mt-6 rounded-2xl border p-4">
        <div className="flex justify-between">
          <span className="text-text-2">Subtotal</span>
          <span className="text-text-1 font-mono">${(subtotalCents / 100).toFixed(2)}</span>
        </div>
        {coupon && couponCheck ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-text-2">15% coupon ({coupon.code})</span>
            {couponCheck.ok ? (
              <span className="text-neon-green font-mono">−${(discount / 100).toFixed(2)}</span>
            ) : (
              <span className="text-text-3 text-xs">{couponReason(couponCheck as { ok: false; reason: string })}</span>
            )}
          </div>
        ) : null}
        <div className="border-border mt-3 flex justify-between border-t pt-3">
          <span className="text-text-1 font-semibold">Total</span>
          <span className="text-neon-yellow font-mono text-xl">${(total / 100).toFixed(2)}</span>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-danger mt-6 text-sm">
          {error}
        </p>
      ) : null}
      {data.paidAt ? (
        <p className="text-neon-green mt-6 font-semibold" data-testid="pay-paid">
          Paid on {data.paidAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Thank
          you! 🐾
        </p>
      ) : !squareConfigured() ? (
        <p className="text-text-2 mt-6">Payments aren&apos;t enabled yet — we&apos;ll send payment details shortly.</p>
      ) : (
        <>
          {data.isOwner && data.savedCards.length > 0 ? (
            <PayWithSavedCard id={id} total={total} cards={data.savedCards} token={data.token} />
          ) : null}
          <form action={`/api/pay/${id}/checkout`} method="post" className="mt-6">
            {data.token ? <input type="hidden" name="t" value={data.token} /> : null}
            <button
              type="submit"
              className="bg-neon-pink text-bg-0 shadow-glow-pink rounded-full px-6 py-3 text-sm font-semibold"
            >
              {data.isOwner && data.savedCards.length > 0
                ? "Pay another way (hosted checkout)"
                : `Pay $${(total / 100).toFixed(2)} securely with Square`}
            </button>
          </form>
        </>
      )}
      <p className="text-text-3 mt-4 text-xs">Pay by card, Apple Pay, Google Pay, Cash App Pay or Afterpay.</p>
      <Link href="/" className="text-neon-cyan mt-6 inline-block text-sm">
        Back home
      </Link>
    </main>
  );
}

async function PayGateLoader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // ?error=<code> comes back from the checkout route; only known codes show (no text from the URL).
  const error = sp.error && sp.error in PAY_ERRORS ? PAY_ERRORS[sp.error as PayErrorCode] : null;
  return <PayGate id={id} token={sp.t ?? null} error={error} />;
}

export default function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; error?: string }>;
}) {
  return (
    <PageTransition>
      <Suspense fallback={<p className="text-text-2 p-10">Loading…</p>}>
        <PayGateLoader params={params} searchParams={searchParams} />
      </Suspense>
    </PageTransition>
  );
}
