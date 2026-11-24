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

/** Best-effort client IP behind Render's proxy (first X-Forwarded-For hop). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Default limits per public form (per IP). Tune here, not in callers. */
export const LIMITS = {
  contact: { limit: 5, windowSeconds: 60 * 60 },
  quote: { limit: 5, windowSeconds: 60 * 60 },
  upload: { limit: 10, windowSeconds: 60 * 60 },
  survey: { limit: 10, windowSeconds: 60 * 60 },
} as const;
