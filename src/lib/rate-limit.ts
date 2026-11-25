import "server-only";

import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import type { Db } from "./db";

/**
 * Fixed-window rate limiting stored in Postgres (portable: no Redis, works across instances).
 * Keys are hashed so raw IPs/emails are never stored.
 */
export type RateLimitResult = { ok: boolean; remaining: number; resetAt: Date };

export async function rateLimit(
  db: Db,
  { key, limit, windowSeconds }: { key: string; limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const hashed = createHash("sha256").update(key).digest("hex");
  const { rows } = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, window_start, count) values (${hashed}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})
                   then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = rows[0]!;
  const count = Number(row.count);
  const resetAt = new Date(new Date(row.window_start).getTime() + windowSeconds * 1000);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

/**
 * Client IP for rate limiting. X-Forwarded-For is "client, proxy1, proxy2…" and each proxy
 * APPENDS the address it saw, so only the rightmost entries are trustworthy; the leftmost
 * can be anything the visitor typed. We take the entry added by our outermost trusted proxy:
 * TRUSTED_PROXY_COUNT (default 1 = Render's load balancer). Add 1 if Cloudflare proxying is
 * ever put in front of Render.
 */
export function clientIp(headers: Headers, trustedProxies = Number(process.env.TRUSTED_PROXY_COUNT ?? 1)): string {
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (hops.length > 0) {
    const index = Math.max(0, hops.length - Math.max(1, trustedProxies));
    return hops[index]!;
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/** Default limits per public form (per IP). Tune here, not in callers. */
export const LIMITS = {
  contact: { limit: 5, windowSeconds: 60 * 60 },
  quote: { limit: 5, windowSeconds: 60 * 60 },
  upload: { limit: 10, windowSeconds: 60 * 60 },
  survey: { limit: 10, windowSeconds: 60 * 60 },
  /** Mockup email gate (docs/04): 5 per hour per IP, plus `mockupEmail` per address. */
  mockup: { limit: 5, windowSeconds: 60 * 60 },
  mockupEmail: { limit: 3, windowSeconds: 24 * 60 * 60 },
  /** Customer confirmation emails per recipient address: stops the forms being used to mail strangers. */
  confirmation: { limit: 3, windowSeconds: 24 * 60 * 60 },
} as const;
