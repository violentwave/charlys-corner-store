import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { derivedKey } from "./auth/secret-box";
import { site } from "./site";

/**
 * Order tracking (2026-11-26). Order requests move through these stages; the customer sees
 * them in "My designs" and gets a short email at each change. The owner moves an order on with
 * one-click links in his order email: each link is signed (HMAC) for one order and one stage,
 * and opens a confirm page (a GET never changes anything, so mail scanners can't).
 */
export const ORDER_STAGES = ["received", "quoted", "in_production", "ready", "completed", "cancelled"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  received: "Received",
  quoted: "Price sent",
  in_production: "In production",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** One line for the customer (email + "My designs"). Fixed copy: nothing typed by anyone. */
export const ORDER_STAGE_DESCRIPTIONS: Record<OrderStage, string> = {
  received: "We got your order request and we'll send you the price soon.",
  quoted: "We sent you the price and an invoice. Check your email.",
  in_production: "Your order is being printed.",
  ready: "Your order is ready! We'll be in touch about pickup or delivery.",
  completed: "Your order is complete. Thanks for ordering!",
  cancelled: "This order was cancelled. Questions? Just reply to our email.",
};

/** The stages the owner's email offers as next steps from `current`. */
export function nextStages(current: OrderStage): OrderStage[] {
  if (current === "completed" || current === "cancelled") return [];
  // "quoted" is now set via the signed owner quote page (P51-3), not a one-click stage link.
  const order: OrderStage[] = ["in_production", "ready", "completed"];
  const after = order.slice(order.indexOf(current as OrderStage) + 1);
  return [...(current === "received" ? order : after), "cancelled"];
}

/** Owner links stay valid this long (an order can take weeks). */
export const OWNER_LINK_DAYS = 120;

function signature(mockupId: string, stage: OrderStage, expires: number): string {
  return createHmac("sha256", derivedKey("owner-order-stage"))
    .update(`${mockupId}.${stage}.${expires}`)
    .digest("base64url");
}

export function ownerStageUrl(mockupId: string, stage: OrderStage, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + OWNER_LINK_DAYS * 24 * 60 * 60;
  const params = new URLSearchParams({ to: stage, exp: String(expires), sig: signature(mockupId, stage, expires) });
  return `${site.url.replace(/\/$/, "")}/api/owner/orders/${mockupId}/stage?${params.toString()}`;
}

export function checkOwnerStageLink(
  mockupId: string,
  to: string | null,
  exp: string | null,
  sig: string | null,
  now = Date.now(),
): OrderStage | null {
  if (!to || !exp || !sig || !(ORDER_STAGES as readonly string[]).includes(to)) return null;
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires * 1000 < now) return null;
  const expected = Buffer.from(signature(mockupId, to as OrderStage, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? (to as OrderStage) : null;
}

export const OWNER_QUOTE_DAYS = 120;
export const PAY_TOKEN_DAYS = 30;

function signatureQuote(mockupId: string, expires: number): string {
  return createHmac("sha256", derivedKey("owner-quote")).update(`${mockupId}.${expires}`).digest("base64url");
}

export function ownerQuoteUrl(mockupId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + OWNER_QUOTE_DAYS * 24 * 60 * 60;
  const params = new URLSearchParams({ exp: String(expires), sig: signatureQuote(mockupId, expires) });
  return `${site.url.replace(/\/$/, "")}/owner/quote/${mockupId}?${params.toString()}`;
}

export function checkOwnerQuoteLink(
  mockupId: string,
  exp: string | null,
  sig: string | null,
  now = Date.now(),
): boolean {
  if (!exp || !sig) return false;
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires * 1000 < now) return false;
  const expected = Buffer.from(signatureQuote(mockupId, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function signaturePay(mockupId: string, expires: number): string {
  return createHmac("sha256", derivedKey("pay")).update(`${mockupId}.${expires}`).digest("base64url");
}

export function payToken(mockupId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + PAY_TOKEN_DAYS * 24 * 60 * 60;
  return `${expires}.${signaturePay(mockupId, expires)}`;
}

export function checkPayToken(mockupId: string, token: string | null, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [exp, sig] = parts;
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires * 1000 < now) return false;
  const expected = Buffer.from(signaturePay(mockupId, expires));
  const given = Buffer.from(sig ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Owner email links: every next stage from `current`. */
export function ownerStageLinks(mockupId: string, current: OrderStage = "received") {
  return nextStages(current).map((stage) => ({
    label: ORDER_STAGE_LABELS[stage],
    url: ownerStageUrl(mockupId, stage),
  }));
}
