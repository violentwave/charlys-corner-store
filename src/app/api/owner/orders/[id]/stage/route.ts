import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { OrderStatusCustomerEmail } from "@/emails/order-status-customer";
import { getDb, schema } from "@/lib/db";
import { clip } from "@/lib/http";
import { sendAccountEmail } from "@/lib/notify";
import { checkOwnerStageLink, ORDER_STAGE_DESCRIPTIONS, ORDER_STAGE_LABELS } from "@/lib/order-stage";
import { loadOrder, orderTitle } from "@/lib/payments";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";

/**
 * The owner's one-click order links (src/lib/order-stage.ts). GET shows a confirm page with a
 * button (mail scanners open links, so a GET never changes anything); POST applies the stage
 * and emails the customer. The signed link is the authorization: no login needed.
 */
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} · ${escape(site.name)}</title>
<style>body{font-family:system-ui,sans-serif;background:#0a0a14;color:#f4f4f8;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{max-width:420px;background:#161629;border-radius:16px;padding:24px}h1{font-size:20px;margin:0 0 12px}p{color:#c9c9d6;line-height:1.5}button{font:inherit;font-weight:600;background:#ff2e97;color:#0a0a14;border:0;border-radius:999px;padding:12px 24px;cursor:pointer;min-height:44px}button:focus-visible{outline:3px solid #00e5ff;outline-offset:3px}</style></head><body><main>${body}</main></body></html>`;
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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const to = checkOwnerStageLink(
    id,
    url.searchParams.get("to"),
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
  );
  const row = to ? await load(id) : null;
  if (!to || !row) return invalid();
  const garment = orderTitle(row.items);
  const current = ORDER_STAGE_LABELS[row.order.stage];
  const fields = ["to", "exp", "sig"]
    .map((k) => `<input type="hidden" name="${k}" value="${escape(url.searchParams.get(k)!)}">`)
    .join("");
  return page(
    "Update order",
    `<h1>Mark this order as “${escape(ORDER_STAGE_LABELS[to])}”?</h1>
<p>${escape(garment)} for ${escape(row.lead.email)}<br>Now: ${escape(current)}</p>
<p>The customer gets a short email: “${escape(ORDER_STAGE_DESCRIPTIONS[to])}”</p>
<form method="post">${fields}<button type="submit">Mark as ${escape(ORDER_STAGE_LABELS[to])}</button></form>`,
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const rl = await rateLimit(db, { key: `owner-stage:${clientIp(await headers())}`, ...LIMITS.ownerStage });
  if (!rl.ok) return page("Slow down", "<h1>Too many updates</h1><p>Please try again in a few minutes.</p>", 429);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalid();
  }
  const get = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : null);
  const to = checkOwnerStageLink(id, get("to"), get("exp"), get("sig"));
  const row = to ? await load(id) : null;
  if (!to || !row) return invalid();

  if (row.order.stage !== to) {
    await db.update(schema.orders).set({ stage: to, stageAt: new Date() }).where(eq(schema.orders.id, id));
    const garment = orderTitle(row.items);
    // Owner-triggered, so not under the per-recipient confirmation cap (that guards public forms).
    await sendAccountEmail(
      row.lead.email,
      `Your order: ${ORDER_STAGE_LABELS[to]} 🐾`,
      OrderStatusCustomerEmail({
        name: row.lead.name ? clip(row.lead.name, 40) : "there",
        garmentName: garment,
        stageLabel: ORDER_STAGE_LABELS[to],
        description: ORDER_STAGE_DESCRIPTIONS[to],
      }),
    );
  }
  return page(
    "Order updated",
    `<h1>Done: “${escape(ORDER_STAGE_LABELS[to])}”</h1><p>The customer can see it in their account and got an email. You can close this tab.</p>`,
  );
}
