// Apply SQL migrations in db/migrations to DATABASE_URL. Portable: any Postgres, any host.
// Usage: pnpm db:migrate   (Render: run as the pre-deploy command)
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
  console.log("Migrations applied");
} finally {
  await pool.end();
}
