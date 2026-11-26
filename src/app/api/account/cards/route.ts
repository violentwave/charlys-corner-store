import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { verifiedUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import {
  createCard,
  existingSquareCustomerId,
  getOrCreateSquareCustomer,
  listCards,
  squareConfigured,
  squareSdkConfig,
} from "@/lib/square";

/** Most saved cards per member ("a card or two on file", Logan 2026-11-26). */
export const MAX_SAVED_CARDS = 3;

const bodySchema = z.object({
  sourceId: z.string().min(1).max(500),
  verificationToken: z.string().max(2000).optional(),
  cardholderName: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(12).optional(),
  // Saving a card needs the member's explicit consent; checked here, not only in the dialog.
  consent: z.literal(true),
});

/** The member's saved cards (empty until they save one: listing never creates a Square customer). */
export async function GET() {
  const db = getDb();
  const v = await verifiedUser(db);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  const sdk = squareSdkConfig();
  if (!sdk) return NextResponse.json({ cards: [], sdk: null });
  const customerId = await existingSquareCustomerId(v.user.id);
  const cards = customerId ? await listCards(customerId).catch(() => []) : [];
  return NextResponse.json({ cards, sdk });
}

/** Saves a card from a Web Payments SDK token (card data never reaches this server). */
export async function POST(request: Request) {
  const db = getDb();
  const v = await verifiedUser(db);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  if (!squareConfigured()) return NextResponse.json({ error: "Saved cards aren't switched on yet." }, { status: 503 });
  const rl = await rateLimit(db, { key: `cards:${v.user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Tick the box to agree to saving the card." }, { status: 400 });
  }

  const customerId = await getOrCreateSquareCustomer({ id: v.user.id, email: v.user.email });
  if (!customerId) return NextResponse.json({ error: "Square didn't answer. Please try again." }, { status: 502 });
  const existing = await listCards(customerId).catch(() => null);
  if (!existing) return NextResponse.json({ error: "Square didn't answer. Please try again." }, { status: 502 });
  if (existing.length >= MAX_SAVED_CARDS) {
    return NextResponse.json(
      { error: `You can save up to ${MAX_SAVED_CARDS} cards. Remove one first.` },
      { status: 409 },
    );
  }

  const saved = await createCard({
    idempotencyKey: randomBytes(16).toString("hex"),
    sourceId: parsed.data.sourceId,
    verificationToken: parsed.data.verificationToken,
    customerId,
    cardholderName: parsed.data.cardholderName,
    postalCode: parsed.data.postalCode,
  });
  if (!saved.ok)
    return NextResponse.json({ error: "Square couldn't save that card. Check the details." }, { status: 400 });
  return NextResponse.json({ card: saved.card });
}
