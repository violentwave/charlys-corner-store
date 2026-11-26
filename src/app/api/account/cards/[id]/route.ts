import { NextResponse } from "next/server";

import { verifiedUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { disableCard, existingSquareCustomerId, getOwnedCard, squareConfigured } from "@/lib/square";

/** Removes (disables) one of the member's own saved cards. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const v = await verifiedUser(db);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  if (!squareConfigured()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rl = await rateLimit(db, { key: `cards:${v.user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });

  const customerId = await existingSquareCustomerId(v.user.id);
  const card = customerId ? await getOwnedCard(id, customerId) : null;
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await disableCard(card.id))) {
    return NextResponse.json({ error: "Square didn't answer. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
