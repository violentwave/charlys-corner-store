import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// Same env loading as scripts/load-env.mjs: .env.local, then .env; real env vars win.
for (const file of [".env.local", ".env"]) {
  const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
  if (existsSync(file) && load) load(file);
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/charly" },
  strict: true,
});
