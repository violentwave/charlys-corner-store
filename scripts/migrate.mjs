// Apply SQL migrations in db/migrations to DATABASE_URL. Portable: any Postgres, any host.
// Usage: pnpm db:migrate   (Render: run as the pre-deploy command)
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { loadLocalEnv } from "./load-env.mjs";

loadLocalEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (add it to .env.local, or export it)");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
  console.log("Migrations applied");
} catch (error) {
  const code = error?.cause?.code ?? error?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
    console.error(`Can't reach the database at ${new URL(url).host}. Is it running? (docker compose up -d)`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
