// @vitest-environment node
/**
 * Custom-order payments (real Postgres, Square mocked at the fetch level): owner sets the price,
 * hosted checkout, pay with a saved card, and the Square webhook. Money paths, so the cases that
 * would cost real money are pinned: amounts come from the DB, a paid order can't be charged again,
 * double clicks / replayed or duplicate events mark paid (and email) once, and access is checked.
 */
import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { schema, type Db } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { upsertLead } from "@/lib/leads";
import { ownerQuoteUrl, payToken } from "@/lib/order-stage";
import { __setFetchForTests } from "@/lib/square";
import { hasTestDb, setupTestDb } from "@/test/db";

const jar = new Map<string, string>();
let forwardedFor = "198.51.100.90";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": forwardedFor }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { GET: quoteGet, POST: quotePost } = await import("./owner/orders/[id]/quote/route");
const { POST: checkout } = await import("./pay/[id]/checkout/route");
const { POST: payCard } = await import("./pay/[id]/card/route");
const { GET: payStatus } = await import("./pay/[id]/status/route");
const { POST: webhook } = await import("./webhooks/square/route");

const ORIGIN = "http://localhost:3000";
const WEBHOOK_URL = `${ORIGIN}/api/webhooks/square`;
const WEBHOOK_KEY = ["webhook", "fixture", "key"].join("-");
const PASSWORD = ["pay", "fixture", "pass"].join("-");
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) =>
  new Request(`${ORIGIN}/api/x`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "localhost:3000" },
    body: JSON.stringify(body),
  });

/** A tiny fake of the Square endpoints we call. Records every request. */
type Call = { method: string; path: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let cards: Record<string, { customer_id: string; enabled: boolean }> = {};
let paymentStatus = "COMPLETED";
let declineCode: string | null = null;
let linkSeq = 0;
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeSquare: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  calls.push({ method, path: url.pathname + url.search, body });
  if (method === "POST" && url.pathname === "/v2/online-checkout/payment-links") {
    linkSeq += 1;
    return reply(200, {
      payment_link: {
        id: `link-${linkSeq}`,
        url: `https://square.link/u/test${linkSeq}`,
        order_id: `order-link-${linkSeq}`,
      },
    });
  }
  if (method === "DELETE" && url.pathname.startsWith("/v2/online-checkout/payment-links/")) return reply(200, {});
  if (method === "GET" && url.pathname.startsWith("/v2/cards/")) {
    const id = decodeURIComponent(url.pathname.split("/")[3]!);
    const card = cards[id];
    return card
      ? reply(200, { card: { id, card_brand: "VISA", last_4: "1111", exp_month: 12, exp_year: 2030, ...card } })
      : reply(404, { errors: [{ code: "NOT_FOUND" }] });
  }
  if (method === "POST" && url.pathname === "/v2/orders") {
    return reply(200, { order: { id: `order-card-${calls.length}` } });
  }
  if (method === "POST" && url.pathname === "/v2/payments") {
    if (declineCode) return reply(400, { errors: [{ category: "PAYMENT_METHOD_ERROR", code: declineCode }] });
    return reply(200, { payment: { id: `pay-${calls.length}`, status: paymentStatus } });
  }
  return reply(404, { errors: [{ code: "NOT_FOUND" }] });
};

function signedWebhook(event: unknown, key = WEBHOOK_KEY) {
  const raw = JSON.stringify(event);
  const sig = createHmac("sha256", key)
    .update(WEBHOOK_URL + raw)
    .digest("base64");
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-square-hmacsha256-signature": sig },
    body: raw,
  });
}
const paymentEvent = (eventId: string, orderId: string, status = "COMPLETED", type = "payment.updated") => ({
  event_id: eventId,
  type,
  data: { object: { payment: { id: `sq-pay-${eventId}`, status, order_id: orderId } } },
});

describe.skipIf(!hasTestDb)("payments (real Postgres, mocked Square)", () => {
  let db: Db;
  let resetDb: () => Promise<void>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.EMAIL_DRIVER = "console";
    process.env.STORAGE_DRIVER = "memory";
    process.env.SQUARE_ENVIRONMENT = "sandbox";
    process.env.SQUARE_ACCESS_TOKEN = ["test", "token"].join("-");
    process.env.SQUARE_LOCATION_ID = "LTEST";
    process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID = "sandbox-app";
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = WEBHOOK_KEY;
    process.env.SQUARE_WEBHOOK_URL = WEBHOOK_URL;
    __setFetchForTests(fakeSquare);
    ({ db, reset: resetDb, close } = await setupTestDb());
  });
  beforeEach(async () => {
    await resetDb();
    _clearOutbox();
    jar.clear();
    calls = [];
    cards = {};
    paymentStatus = "COMPLETED";
    declineCode = null;
    linkSeq = 0;
    forwardedFor = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  });
  afterAll(async () => {
    __setFetchForTests(null);
    await close();
  });

  async function member(email = "payer@example.com", signIn = true) {
    const leadId = await upsertLead(db, { email, name: "Payer" });
    const [user] = await db
      .insert(schema.users)
      .values({ email, name: "Payer", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date(), leadId })
      .returning();
    if (signIn) jar.set("ccs_session", (await createSession(db, user!.id)).token);
    return { user: user!, leadId };
  }
  async function order(userId: string | null, leadId: string, quoteCents: number | null = 4000) {
    const [row] = await db
      .insert(schema.mockups)
      .values({
        leadId,
        userId,
        kind: "order",
        garment: "hoodie",
        colors: { body: "#ffffff" },
        sizes: { M: 2 },
        views: [{ view: "front", printArea: "full-front", layers: [], mockupKey: "orders/x.png" } as never],
        orderStage: "received",
        quoteCents,
        quotedAt: quoteCents ? new Date() : null,
      })
      .returning();
    return row!;
  }
  const rows = (mockupId: string) =>
    db.select().from(schema.orderPayments).where(eq(schema.orderPayments.mockupId, mockupId));
  const mockup = async (id: string) => (await db.select().from(schema.mockups).where(eq(schema.mockups.id, id)))[0]!;

  it("owner link: the email URL opens the price form, saves the price and emails a Pay now link", async () => {
    const { user, leadId } = await member();
    const row = await order(user.id, leadId, null);
    const link = new URL(ownerQuoteUrl(row.id));
    expect(link.pathname).toBe(`/api/owner/orders/${row.id}/quote`); // the route that exists
    const get = await quoteGet(new Request(link), params(row.id));
    expect(get.status).toBe(200);
    expect(await get.text()).toContain("Set the price");

    const form = new URLSearchParams({ exp: link.searchParams.get("exp")!, sig: link.searchParams.get("sig")! });
    form.set("price", "42.50");
    const post = await quotePost(
      new Request(link, {
        method: "POST",
        body: form,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      params(row.id),
    );
    expect(post.status).toBe(200);
    const saved = await mockup(row.id);
    expect(saved.quoteCents).toBe(4250);
    expect(saved.orderStage).toBe("quoted");
    const mail = _outbox().at(-1)!;
    expect(mail.to).toBe("payer@example.com");
    expect(mail.html).toContain(`/pay/${row.id}?t=`);

    // Forged signature: nothing changes.
    form.set("sig", "nope");
    form.set("price", "1.00");
    const forged = await quotePost(
      new Request(link, {
        method: "POST",
        body: form,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      params(row.id),
    );
    expect(forged.status).toBe(400);
    expect((await mockup(row.id)).quoteCents).toBe(4250);
  });

  it("checkout: one link per amount, price from the DB, form posts redirect to Square", async () => {
    const { user, leadId } = await member();
    const row = await order(user.id, leadId, 4000);

    const first = await checkout(json({ amount: 1 }), params(row.id)); // a client amount is ignored
    expect(first.status).toBe(200);
    expect(((await first.json()) as { url: string }).url).toBe("https://square.link/u/test1");
    const linkCall = calls.find((c) => c.path === "/v2/online-checkout/payment-links")!;
    const sentOrder = linkCall.body!.order as { line_items: { base_price_money: { amount: number } }[] };
    expect(sentOrder.line_items[0]!.base_price_money.amount).toBe(4000);

    const again = await checkout(json({}), params(row.id));
    expect(((await again.json()) as { url: string }).url).toBe("https://square.link/u/test1");
    expect(calls.filter((c) => c.path === "/v2/online-checkout/payment-links")).toHaveLength(1);
    expect(await rows(row.id)).toHaveLength(1);

    const form = await checkout(
      new Request(`${ORIGIN}/api/x`, { method: "POST", body: new URLSearchParams({}) }),
      params(row.id),
    );
    expect(form.status).toBe(303);
    expect(form.headers.get("location")).toBe("https://square.link/u/test1");
  });

  it("checkout access: owner or signed token only; paid orders can't be paid again", async () => {
    const owner = await member("owner@example.com", false);
    const row = await order(owner.user.id, owner.leadId);
    expect((await checkout(json({}), params(row.id))).status).toBe(404); // nobody signed in
    await member("someone@example.com"); // another member
    expect((await checkout(json({}), params(row.id))).status).toBe(404);
    expect((await checkout(json({ t: "1.forged" }), params(row.id))).status).toBe(404);
    const guest = await checkout(json({ t: payToken(row.id) }), params(row.id));
    expect(guest.status).toBe(200);

    await db.update(schema.mockups).set({ paidAt: new Date() }).where(eq(schema.mockups.id, row.id));
    expect((await checkout(json({ t: payToken(row.id) }), params(row.id))).status).toBe(409);
    const form = await checkout(
      new Request(`${ORIGIN}/api/x`, { method: "POST", body: new URLSearchParams({ t: payToken(row.id) }) }),
      params(row.id),
    );
    expect(form.headers.get("location")).toContain("error=paid");
  });

  it("re-quoting cancels the old unpaid link", async () => {
    const { user, leadId } = await member();
    const row = await order(user.id, leadId, 4000);
    await checkout(json({}), params(row.id));
    const link = new URL(ownerQuoteUrl(row.id));
    const form = new URLSearchParams({ exp: link.searchParams.get("exp")!, sig: link.searchParams.get("sig")! });
    form.set("price", "55.00");
    await quotePost(
      new Request(link, {
        method: "POST",
        body: form,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      params(row.id),
    );
    const [old] = await rows(row.id);
    expect(old!.status).toBe("canceled");
    expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/link-1"))).toBe(true);
    const next = await checkout(json({}), params(row.id));
    expect(((await next.json()) as { url: string }).url).toBe("https://square.link/u/test2");
  });

  it("webhook: verified COMPLETED marks paid once, unlocks the coupon, emails once", async () => {
    const { user, leadId } = await member();
    const row = await order(user.id, leadId, 4000);
    await checkout(json({}), params(row.id));
    _clearOutbox();

    expect((await webhook(signedWebhook(paymentEvent("e1", "order-link-1"), "wrong-key"))).status).toBe(401);
    expect((await mockup(row.id)).paidAt).toBeNull();

    expect(
      (await webhook(signedWebhook(paymentEvent("e1", "order-link-1", "COMPLETED", "payment.created")))).status,
    ).toBe(200);
    expect((await webhook(signedWebhook(paymentEvent("e1", "order-link-1")))).status).toBe(200); // replay
    expect((await webhook(signedWebhook(paymentEvent("e2", "order-link-1")))).status).toBe(200); // 2nd event

    expect((await mockup(row.id)).paidAt).not.toBeNull();
    const [pay] = await rows(row.id);
    expect(pay!.status).toBe("paid");
    // No coupon existed before; the first payment creates it, unlocked, and emails the code.
    const coupons = await db.select().from(schema.coupons).where(eq(schema.coupons.leadId, leadId));
    expect(coupons).toHaveLength(1);
    expect(coupons[0]!.status).toBe("eligible");
    expect(_outbox().map((m) => m.subject)).toEqual([
      expect.stringContaining("Payment received"),
      expect.stringContaining("Paid: $40.00"),
    ]);
    expect(_outbox()[0]!.html).toContain(coupons[0]!.code);

    const status = await payStatus(new Request(`${ORIGIN}/api/pay/${row.id}/status`), params(row.id));
    expect(((await status.json()) as { status: string }).status).toBe("paid");
  });

  it("2nd order: the unlocked 15% applies (server-side) and is redeemed when paid", async () => {
    const { user, leadId } = await member();
    const first = await order(user.id, leadId, 4000);
    const before = await checkout(json({}), params(first.id));
    expect(before.status).toBe(200);
    const [firstPay] = await rows(first.id);
    expect(firstPay!.discountCents).toBe(0); // no coupon before the first paid order
    await webhook(signedWebhook(paymentEvent("p1", "order-link-1")));

    const second = await order(user.id, leadId, 10000);
    const res = await checkout(json({}), params(second.id));
    expect(res.status).toBe(200);
    const [pay] = await rows(second.id);
    expect(pay).toMatchObject({ subtotalCents: 10000, discountCents: 1500, amountCents: 8500 });
    await webhook(signedWebhook(paymentEvent("p2", "order-link-2")));
    const [coupon] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, pay!.couponId!));
    expect(coupon!.status).toBe("redeemed");
  });

  it("saved card: pays once (webhook after is a no-op); only the member's own card; declines fail cleanly", async () => {
    const { user, leadId } = await member();
    await db.update(schema.users).set({ squareCustomerId: "CUST-1" }).where(eq(schema.users.id, user.id));
    cards = {
      "card-mine": { customer_id: "CUST-1", enabled: true },
      "card-theirs": { customer_id: "CUST-2", enabled: true },
    };
    const row = await order(user.id, leadId, 4000);

    expect((await payCard(json({ cardId: "card-theirs" }), params(row.id))).status).toBe(404);

    declineCode = "CVV_FAILURE";
    const declined = await payCard(json({ cardId: "card-mine" }), params(row.id));
    expect(declined.status).toBe(402);
    expect(((await declined.json()) as { error: string }).error).toContain("CVV");
    declineCode = null;

    _clearOutbox();
    const paid = await payCard(json({ cardId: "card-mine" }), params(row.id));
    expect(await paid.json()).toMatchObject({ ok: true, paid: true });
    const payment = calls.filter((c) => c.path === "/v2/payments").at(-1)!;
    expect(payment.body).toMatchObject({
      source_id: "card-mine",
      customer_id: "CUST-1",
      amount_money: { amount: 4000 },
    });
    const statuses = (await rows(row.id)).map((r) => r.status).sort();
    expect(statuses).toEqual(["failed", "paid"]);
    expect(_outbox()).toHaveLength(2); // customer + owner, from the card route

    const orderId = (await rows(row.id)).find((r) => r.status === "paid")!.squareOrderId!;
    await webhook(signedWebhook(paymentEvent("c1", orderId)));
    expect(_outbox()).toHaveLength(2); // webhook arriving later sends nothing new

    expect((await payCard(json({ cardId: "card-mine" }), params(row.id))).status).toBe(409); // already paid
  });

  it("saved card: a second charge while one is in flight is refused", async () => {
    const { user, leadId } = await member();
    await db.update(schema.users).set({ squareCustomerId: "CUST-1" }).where(eq(schema.users.id, user.id));
    cards = { "card-mine": { customer_id: "CUST-1", enabled: true } };
    const row = await order(user.id, leadId, 4000);
    await db.insert(schema.orderPayments).values({
      mockupId: row.id,
      leadId,
      amountCents: 4000,
      subtotalCents: 4000,
      method: "card_on_file",
      status: "pending",
      idempotencyKey: "in-flight",
      url: `/pay/${row.id}`,
    });
    const res = await payCard(json({ cardId: "card-mine" }), params(row.id));
    expect(res.status).toBe(409);
    expect(calls.some((c) => c.path === "/v2/payments")).toBe(false);
  });

  it("saved card: Square still processing leaves it pending for the webhook", async () => {
    const { user, leadId } = await member();
    await db.update(schema.users).set({ squareCustomerId: "CUST-1" }).where(eq(schema.users.id, user.id));
    cards = { "card-mine": { customer_id: "CUST-1", enabled: true } };
    const row = await order(user.id, leadId, 4000);
    paymentStatus = "PENDING";
    const res = await payCard(json({ cardId: "card-mine" }), params(row.id));
    expect(await res.json()).toMatchObject({ ok: true, paid: false, pending: true });
    const [pay] = await rows(row.id);
    expect(pay!.status).toBe("pending");
    await webhook(signedWebhook(paymentEvent("w1", pay!.squareOrderId!)));
    expect((await mockup(row.id)).paidAt).not.toBeNull();
  });
});
