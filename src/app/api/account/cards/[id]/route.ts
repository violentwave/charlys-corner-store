import { NextResponse } from "next/server";

import { verifiedUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getOrCreateSquareCustomer, squareBaseUrl } from "@/lib/square";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const v = await verifiedUser(db);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
  const user = v.user;

  const customerId = await getOrCreateSquareCustomer({ id: user.id, email: user.email });
  if (!customerId) return NextResponse.json({ error: "payments not enabled" }, { status: 503 });

  // Confirm the card belongs to this customer before disabling.
  const r = await fetch(`${squareBaseUrl()}/v2/cards/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
    },
  });
  const json = (await r.json().catch(() => null)) as { card?: { customer_id: string } } | null;
  if (!r.ok || !json?.card || json.card.customer_id !== customerId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const dr = await fetch(`${squareBaseUrl()}/v2/cards/${encodeURIComponent(id)}/disable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2024-10-17",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!dr.ok) return NextResponse.json({ error: "couldn't remove the card" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
