import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
/**
 * Square client (plain fetch, no SDK). Hosted payment links + webhooks (P51-3).
 * Base URL pinned to the environment; every create call carries an idempotency key.
 * Docs: Checkout API "Create payment link", Webhooks "Validate notifications",
 * Payments/Orders objects.
 */
const SQUARE_VERSION = "2024-10-17";

/** Injected in tests so no real network is touched. */
let fetchImpl: typeof fetch = globalThis.fetch;

/** Tests only: swap the fetch implementation. Never call from production code. */
export function __setFetchForTests(impl: typeof fetch | null): void {
  fetchImpl = impl ?? globalThis.fetch;
}

export type SquareEnvironment = "sandbox" | "production";

export function squareEnvironment(): SquareEnvironment {
  return process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function squareBaseUrl(): string {
  return squareEnvironment() === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
}

/**
 * What the browser needs to load the Web Payments SDK (all public values). Served by
 * GET /api/account/cards so the client never depends on extra NEXT_PUBLIC_* variables.
 */
export function squareSdkConfig(): { applicationId: string; locationId: string; scriptUrl: string } | null {
  if (!squareConfigured()) return null;
  return {
    applicationId: process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID!,
    locationId: process.env.SQUARE_LOCATION_ID!,
    scriptUrl:
      squareEnvironment() === "production"
        ? "https://web.squarecdn.com/v1/square.js"
        : "https://sandbox.web.squarecdn.com/v1/square.js",
  };
}

export function squareConfigured(): boolean {
  return Boolean(
    process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID && process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID,
  );
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN ?? ""}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_VERSION,
  };
}

export type SquareMoney = { amount: number; currency: "USD" };

export type CreatePaymentLinkInput = {
  idempotencyKey: string;
  name: string;
  subtotalCents: number;
  discountCents: number;
  discountLabel?: string;
  buyerEmail: string;
  redirectUrl: string;
};

export type CreatePaymentLinkResult = {
  id: string;
  url: string;
  orderId: string;
};

export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
  const body: Record<string, unknown> = {
    idempotency_key: input.idempotencyKey,
    description: input.name,
    // An order (not a quick_pay) so the discount line, tax and the webhook's order_id
    // all line up with one object.
    order: orderBody(input),
    pre_populated_data: { buyer_email: input.buyerEmail },
    checkout_options: {
      redirect_url: input.redirectUrl,
      accepted_payment_methods: {
        apple_pay: true,
        google_pay: true,
        cash_app_pay: true,
        afterpay_clearpay: true,
      },
    },
  };

  const res = await fetchImpl(`${squareBaseUrl()}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    payment_link?: { id: string; url: string; order_id: string };
    errors?: { detail?: string }[];
  } | null;
  if (!res.ok || !json?.payment_link) {
    throw new Error(json?.errors?.[0]?.detail ?? `Square payment link failed (${res.status})`);
  }
  return { id: json.payment_link.id, url: json.payment_link.url, orderId: json.payment_link.order_id };
}

/** One Square API call through the injectable fetch. Never logs the token or the body. */
export async function squareFetch<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: (T & { errors?: SquareError[] }) | null }> {
  const res = await fetchImpl(`${squareBaseUrl()}${path}`, {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (T & { errors?: SquareError[] }) | null;
  return { ok: res.ok, status: res.status, json };
}

export type SquareError = { category?: string; code?: string; detail?: string };

export type SavedCard = { id: string; brand: string; last4: string; expMonth: number; expYear: number };
type RawCard = {
  id: string;
  card_brand: string;
  last_4: string;
  exp_month: number;
  exp_year: number;
  enabled?: boolean;
  customer_id?: string;
};
const toSavedCard = (c: RawCard): SavedCard => ({
  id: c.id,
  brand: c.card_brand,
  last4: c.last_4,
  expMonth: c.exp_month,
  expYear: c.exp_year,
});

/** Enabled cards on file for a Square customer. */
export async function listCards(customerId: string): Promise<SavedCard[]> {
  const r = await squareFetch<{ cards?: RawCard[] }>("GET", `/v2/cards?customer_id=${encodeURIComponent(customerId)}`);
  return (r.json?.cards ?? []).filter((c) => c.enabled !== false).map(toSavedCard);
}

/** The card, only when it's enabled and belongs to `customerId` (ownership check). */
export async function getOwnedCard(cardId: string, customerId: string): Promise<SavedCard | null> {
  const r = await squareFetch<{ card?: RawCard }>("GET", `/v2/cards/${encodeURIComponent(cardId)}`);
  const c = r.json?.card;
  return r.ok && c && c.customer_id === customerId && c.enabled !== false ? toSavedCard(c) : null;
}

export async function createCard(input: {
  idempotencyKey: string;
  sourceId: string;
  verificationToken?: string;
  customerId: string;
  cardholderName?: string;
  postalCode?: string;
}): Promise<{ ok: true; card: SavedCard } | { ok: false; error: string }> {
  const r = await squareFetch<{ card?: RawCard }>("POST", "/v2/cards", {
    idempotency_key: input.idempotencyKey,
    source_id: input.sourceId,
    verification_token: input.verificationToken,
    card: {
      customer_id: input.customerId,
      cardholder_name: input.cardholderName || undefined,
      billing_address: input.postalCode ? { postal_code: input.postalCode } : undefined,
    },
  });
  if (!r.ok || !r.json?.card) return { ok: false, error: r.json?.errors?.[0]?.detail ?? "Couldn't save the card." };
  return { ok: true, card: toSavedCard(r.json.card) };
}

export async function disableCard(cardId: string): Promise<boolean> {
  const r = await squareFetch("POST", `/v2/cards/${encodeURIComponent(cardId)}/disable`, {});
  return r.ok;
}

/** A Square order for one custom order (line item + optional coupon discount). */
export async function createOrder(input: {
  idempotencyKey: string;
  name: string;
  subtotalCents: number;
  discountCents: number;
  discountLabel?: string;
}): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const r = await squareFetch<{ order?: { id: string } }>("POST", "/v2/orders", {
    idempotency_key: input.idempotencyKey,
    order: orderBody(input),
  });
  if (!r.ok || !r.json?.order?.id)
    return { ok: false, error: r.json?.errors?.[0]?.detail ?? "Couldn't create the order." };
  return { ok: true, orderId: r.json.order.id };
}

/** Charges a card on file for an order. `status` is Square's (COMPLETED, APPROVED, PENDING, FAILED…). */
export async function createCardPayment(input: {
  idempotencyKey: string;
  cardId: string;
  customerId: string;
  orderId: string;
  amountCents: number;
}): Promise<{ ok: true; paymentId: string; status: string } | { ok: false; error?: SquareError }> {
  const r = await squareFetch<{ payment?: { id: string; status: string } }>("POST", "/v2/payments", {
    idempotency_key: input.idempotencyKey,
    source_id: input.cardId,
    customer_id: input.customerId,
    order_id: input.orderId,
    location_id: process.env.SQUARE_LOCATION_ID,
    amount_money: { amount: input.amountCents, currency: "USD" },
    autocomplete: true,
  });
  if (!r.ok || !r.json?.payment) return { ok: false, error: r.json?.errors?.[0] };
  return { ok: true, paymentId: r.json.payment.id, status: r.json.payment.status };
}

/** Best-effort: a re-quoted order's old link should stop taking money. */
export async function deletePaymentLink(id: string): Promise<boolean> {
  const r = await squareFetch("DELETE", `/v2/online-checkout/payment-links/${encodeURIComponent(id)}`);
  return r.ok;
}

function orderBody(input: { name: string; subtotalCents: number; discountCents: number; discountLabel?: string }) {
  return {
    location_id: process.env.SQUARE_LOCATION_ID,
    line_items: [
      { name: input.name, quantity: "1", base_price_money: { amount: input.subtotalCents, currency: "USD" } },
    ],
    discounts:
      input.discountCents > 0
        ? [
            {
              name: input.discountLabel ?? "Coupon",
              scope: "ORDER",
              amount_money: { amount: input.discountCents, currency: "USD" },
              type: "FIXED_AMOUNT",
            },
          ]
        : undefined,
  };
}

/** The member's Square customer id if we already made one (never creates: page views stay read-only). */
export async function existingSquareCustomerId(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: schema.users.squareCustomerId })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row?.id ?? null;
}

export type SquarePayment = {
  id: string;
  status: string;
  orderId?: string;
  amountMoney?: { amount: number; currency: string };
};
export async function getOrCreateSquareCustomer(user: { id: string; email: string }): Promise<string | null> {
  if (!squareConfigured()) return null;
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.users.squareCustomerId })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  if (existing?.id) return existing.id;

  // search by reference_id
  try {
    const res = await fetchImpl(`${squareBaseUrl()}/v2/customers/search`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query: { filter: { reference_id: { exact: user.id } } } }),
    });
    const json = (await res.json().catch(() => null)) as { customers?: { id: string }[] } | null;
    if (res.ok && json?.customers?.[0]?.id) {
      const id = json.customers[0].id;
      await db.update(schema.users).set({ squareCustomerId: id }).where(eq(schema.users.id, user.id));
      return id;
    }
  } catch {
    // fall through to create
  }

  // create
  try {
    const res = await fetchImpl(`${squareBaseUrl()}/v2/customers`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        idempotency_key: randomBytes(16).toString("hex"),
        email_address: user.email,
        reference_id: user.id,
      }),
    });
    const json = (await res.json().catch(() => null)) as { customer?: { id: string } } | null;
    if (res.ok && json?.customer?.id) {
      const id = json.customer.id;
      await db.update(schema.users).set({ squareCustomerId: id }).where(eq(schema.users.id, user.id));
      return id;
    }
  } catch {
    // not configured / network
  }
  return null;
}
export async function retrievePayment(id: string): Promise<SquarePayment> {
  const res = await fetchImpl(`${squareBaseUrl()}/v2/payments/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: authHeaders(),
  });
  const json = (await res.json().catch(() => null)) as {
    payment?: SquarePayment;
    errors?: { detail?: string }[];
  } | null;
  if (!res.ok || !json?.payment) {
    throw new Error(json?.errors?.[0]?.detail ?? `Square retrieve payment failed (${res.status})`);
  }
  return json.payment;
}

/**
 * Square webhook signature verification (docs: Webhooks "Validate notifications").
 * The X-Square-HmacSha256-Signature header is base64(HMAC-SHA256(signatureKey, notificationUrl + rawBody)).
 * Compared with timingSafeEqual.
 */
export function verifySquareSignature(
  rawBody: string,
  header: string | null,
  notificationUrl: string,
  key: string,
): boolean {
  if (!header || !key) return false;
  try {
    const hmac = createHmac("sha256", key)
      .update(notificationUrl + rawBody)
      .digest();
    const given = Buffer.from(header, "base64");
    if (given.length !== hmac.length) return false;
    return timingSafeEqual(given, hmac);
  } catch {
    return false;
  }
}
