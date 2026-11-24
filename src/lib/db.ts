import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../db/schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __charlyPool?: Pool; __charlyDb?: Db };

/**
 * Lazy singleton (survives dev hot reloads). Portability rule: the only way to reach the
 * database is DATABASE_URL through Drizzle/pg; no vendor SDKs.
 */
export function getDb(): Db {
  if (globalForDb.__charlyDb) return globalForDb.__charlyDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  globalForDb.__charlyPool = pool;
  globalForDb.__charlyDb = drizzle(pool, { schema });
  return globalForDb.__charlyDb;
}

export { schema };
