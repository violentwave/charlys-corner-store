import { NextResponse } from "next/server";
import { z } from "zod";

import { verifiedUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getOrCreateSquareCustomer, squareBaseUrl } from "@/lib/square";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

const bodySchema = z.object({
  sourceId: z.string().min(1),
  verificationToken: z.string().optional(),
  cardholderName: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
});

export async function GET() {
  const db = getDb();
  const v = await verifiedUser(db);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  const user = v.user;
  if (!process.env.SQUARE_ACCESS_TOKEN) return NextResponse.json({ cards: [] });

  const customerId = await getOrCreateSquareCustomer({ id: user.id, email: user.email });
  if (!customerId) return NextResponse.json({ cards: [] });

  const r = await fetch(`${squareBaseUrl()}/v2/cards?customer_id=${encodeURIComponent(customerId)}`, {
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
    },
  });
  const json = (await r.json().catch(() => null)) as {
    cards?: { id: string; card_brand: string; last_4: string; exp_month: number; exp_year: number; enabled: boolean }[];
  } | null;
  const cards = (json?.cards ?? [])
    .filter((c) => c.enabled !== false)
    .map((c) => ({ id: c.id, brand: c.card_brand, last4: c.last_4, expMonth: c.exp_month, expYear: c.exp_year }));
  return NextResponse.json({ cards });
}

export async function POST(request: Request) {
  const db = getDb();
  const v = await verifiedUser(db);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  const user = v.user;
  const rl = await rateLimit(db, { key: `cards:${user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });

  const customerId = await getOrCreateSquareCustomer({ id: user.id, email: user.email });
  if (!customerId) return NextResponse.json({ error: "payments not enabled" }, { status: 503 });

  const listRes = await fetch(`${squareBaseUrl()}/v2/cards?customer_id=${encodeURIComponent(customerId)}`, {
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
    },
  });
  const listJson = (await listRes.json().catch(() => null)) as { cards?: { enabled: boolean }[] } | null;
  const count = (listJson?.cards ?? []).filter((c) => c.enabled !== false).length;
  if (count >= 3) return NextResponse.json({ error: "card limit reached" }, { status: 409 });

  const idempotencyKey = (await import("node:crypto")).randomBytes(16).toString("hex");
  const res = await fetch(`${squareBaseUrl()}/v2/cards`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: idempotencyKey,
      source_id: parsed.data.sourceId,
      verification_token: parsed.data.verificationToken,
      card: {
        customer_id: customerId,
        billing_address: parsed.data.postalCode ? { postal_code: parsed.data.postalCode } : undefined,
        cardholder_name: parsed.data.cardholderName,
      },
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    card?: { id: string; card_brand: string; last_4: string; exp_month: number; exp_year: number };
    errors?: { detail?: string }[];
  } | null;
  if (!res.ok || !json?.card) {
    return NextResponse.json({ error: json?.errors?.[0]?.detail ?? "Couldn't save the card." }, { status: 400 });
  }
  return NextResponse.json({
    card: {
      id: json.card.id,
      brand: json.card.card_brand,
      last4: json.card.last_4,
      expMonth: json.card.exp_month,
      expYear: json.card.exp_year,
    },
  });
}
