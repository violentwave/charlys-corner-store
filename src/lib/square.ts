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
    order: {
      location_id: process.env.SQUARE_LOCATION_ID,
      line_items: [
        {
          name: input.name,
          quantity: "1",
          base_price_money: { amount: input.subtotalCents, currency: "USD" },
        },
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
    },
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
