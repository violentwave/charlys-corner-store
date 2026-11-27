import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { QuoteReadyCustomerEmail } from "@/emails/quote-ready-customer";
import { getDb, schema } from "@/lib/db";
import { getGarment, type GarmentId } from "@/lib/garments";
import type { MockupSizes } from "@/lib/mockup-schema";
import { clip } from "@/lib/http";
import { sendAccountEmail } from "@/lib/notify";
import { checkOwnerQuoteLink, OWNER_QUOTE_DAYS, payToken } from "@/lib/order-stage";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";
import { cancelPendingPayments, loadOrder, orderTitle } from "@/lib/payments";
import { squareConfigured } from "@/lib/square";

const quoteSchema = z
  .object({
    priceDollars: z
      .string()
      .regex(/^\d{1,5}(\.\d{1,2})?$/, "Enter a price like 42.00")
      .transform((v) => Math.round(Number(v) * 100)),
    note: z
      .string()
      .max(300)
      .optional()
      .transform((v) => clip(v ?? "", 300) || null),
  })
  .refine((v) => v.priceDollars >= 100 && v.priceDollars <= 5_000_000, {
    message: "Price must be between $1.00 and $50,000.00",
    path: ["priceDollars"],
  });

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} · ${escape(site.name)}</title>
<style>body{font-family:system-ui,sans-serif;background:#0a0a14;color:#f4f4f8;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{max-width:440px;background:#161629;border-radius:16px;padding:24px;width:100%}h1{font-size:20px;margin:0 0 12px}p{color:#c9c9d6;line-height:1.5;margin:0 0 12px}label{display:block;font-size:13px;color:#c9c9d6;margin:0 0 4px}input,textarea{width:100%;box-sizing:border-box;font:inherit;background:#0a0a14;color:#f4f4f8;border:1px solid #2e2e4a;border-radius:10px;padding:10px 12px;min-height:44px}button{font:inherit;font-weight:600;background:#ff2e97;color:#0a0a14;border:0;border-radius:999px;padding:12px 24px;cursor:pointer;min-height:44px}button:focus-visible{outline:3px solid #00e5ff;outline-offset:3px}a{color:#00e5ff}small{color:#7c7a9c;font-size:12px}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

const invalid = () =>
  page(
    "Link expired",
    "<h1>This link doesn't work</h1><p>It may have expired. Use the links in a newer order email.</p>",
    400,
  );

const load = (id: string) => loadOrder(getDb(), id);

const pieces = (sizes: MockupSizes) => Object.values(sizes).reduce((n, q) => n + (q ?? 0), 0);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const ok = checkOwnerQuoteLink(id, url.searchParams.get("exp"), url.searchParams.get("sig"));
  const row = ok ? await load(id) : null;
  if (!ok || !row) return invalid();
  const order = row.order;
  const list = row.items
    .map((m) => `<li>${escape(getGarment(m.garment as GarmentId).name)} · ${pieces(m.sizes)} pcs</li>`)
    .join("");
  const fields = ["exp", "sig"]
    .map((k) => `<input type="hidden" name="${k}" value="${escape(url.searchParams.get(k)!)}">`)
    .join("");
  const current = order.quoteCents ? `$${(order.quoteCents / 100).toFixed(2)}` : "not set yet";
  const paid = order.paidAt ? "<p><strong>Already paid.</strong> Re-quoting is locked.</p>" : "";
  const form = order.paidAt
    ? ""
    : `<form method="post">${fields}<label>Price (USD)</label><input name="price" inputmode="decimal" required value="${escape(order.quoteCents ? (order.quoteCents / 100).toFixed(2) : "")}"><label>Note to the customer (optional)</label><textarea name="note" maxlength="300" rows="3">${escape(order.quoteNote ?? "")}</textarea><button type="submit">Save price & email the customer</button></form>`;
  return page(
    "Set the price",
    `<h1>Set the price</h1><p>${row.items.length} design${row.items.length === 1 ? "" : "s"} for ${escape(row.lead.email)}</p><ul>${list}</ul><p>Current: ${escape(current)} for the whole order</p>${paid}${form}<p><small>Valid ${OWNER_QUOTE_DAYS} days.</small></p>`,
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const rl = await rateLimit(db, { key: `owner-quote:${clientIp(await headers())}`, ...LIMITS.ownerQuote });
  if (!rl.ok) return page("Slow down", "<h1>Too many updates</h1><p>Please try again in a few minutes.</p>", 429);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalid();
  }
  const url = new URL(request.url);
  const ok = checkOwnerQuoteLink(
    id,
    form.get("exp")?.toString() ?? url.searchParams.get("exp"),
    form.get("sig")?.toString() ?? url.searchParams.get("sig"),
  );
  const row = ok ? await load(id) : null;
  if (!ok || !row) return invalid();
  if (row.order.paidAt)
    return page("Already paid", "<h1>Already paid</h1><p>This order is paid; re-quoting is locked.</p>", 409);

  const parsed = quoteSchema.safeParse({
    priceDollars: form.get("price")?.toString() ?? "",
    note: form.get("note")?.toString() ?? "",
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return page(
      "Invalid",
      `<h1>Check the form</h1><p>${escape(msg)}</p><p><a href="javascript:history.back()">Back</a></p>`,
      400,
    );
  }

  const quoteCents = parsed.data.priceDollars;
  const note = parsed.data.note;
  const now = new Date();
  // A new price retires any unpaid link for the old one.
  await cancelPendingPayments(db, id);
  await db
    .update(schema.orders)
    .set({ quoteCents, quoteNote: note, quotedAt: now, stage: "quoted", stageAt: now })
    .where(eq(schema.orders.id, id));

  const garment = orderTitle(row.items);
  // The signed token lets guests (and members on another device) open the pay page.
  const customerUrl = squareConfigured() ? `${site.url.replace(/\/$/, "")}/pay/${id}?t=${payToken(id)}` : null;
  await sendAccountEmail(
    row.lead.email,
    `Your price is ready — ${garment} 🐾`,
    QuoteReadyCustomerEmail({ garmentName: garment, priceCents: quoteCents, note, payUrl: customerUrl }),
  );
  // Owner stage already moved to quoted; the existing stage route's email path is replaced by this flow.
  return page(
    "Price saved",
    `<h1>Saved: $${(quoteCents / 100).toFixed(2)}</h1><p>The customer got an email with the price and a way to pay.</p>`,
  );
}
