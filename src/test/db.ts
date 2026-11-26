/**
 * Real-Postgres test helper. Tests that need a database use `describe.skipIf(!hasTestDb)`.
 * CI always provides TEST_DATABASE_URL (Postgres service); locally: docker compose up -d db,
 * then TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/charly_test pnpm test
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

import * as schema from "../../db/schema";
import type { Db } from "@/lib/db";

export const hasTestDb = !!process.env.TEST_DATABASE_URL;

export async function setupTestDb(): Promise<{ db: Db; reset: () => Promise<void>; close: () => Promise<void> }> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });
  await db.execute(
    sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`,
  );
  await migrate(db, { migrationsFolder: "db/migrations" });
  return {
    db,
    reset: async () => {
      await db.execute(
        sql`truncate leads, contact_messages, quotes, uploads, survey_responses, rate_limits, coupons, mockups, users, sessions, auth_tokens, webhook_events restart identity cascade`,
      );
    },
    close: () => pool.end(),
  };
}
