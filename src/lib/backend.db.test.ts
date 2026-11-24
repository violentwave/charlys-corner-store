// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { leads } from "../../db/schema";
import { hasTestDb, setupTestDb } from "@/test/db";
import type { Db } from "./db";
import { upsertLead } from "./leads";
import { rateLimit } from "./rate-limit";

describe.skipIf(!hasTestDb)("database (real Postgres)", () => {
  let db: Db;
  let reset: () => Promise<void>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, reset, close } = await setupTestDb());
  });
  beforeEach(async () => reset());
  afterAll(async () => close());

  it("applies migrations (all Phase 3 tables exist)", async () => {
    const rows = await db.select().from(leads);
    expect(rows).toEqual([]);
  });

  describe("upsertLead", () => {
    it("dedupes by email case-insensitively and never erases known values", async () => {
      const a = await upsertLead(db, { email: "Charly@Example.com", name: "Charly", phone: "772-555-0100" });
      const b = await upsertLead(db, { email: "charly@example.COM", name: "", referralSource: "friend" });
      expect(b).toBe(a);
      const [row] = await db.select().from(leads).where(eq(leads.id, a));
      expect(row).toMatchObject({
        email: "charly@example.com",
        name: "Charly",
        phone: "772-555-0100",
        referralSource: "friend",
      });
    });
  });

  describe("rateLimit", () => {
    it("allows up to the limit, then blocks within the window", async () => {
      const opts = { key: "contact:1.2.3.4", limit: 2, windowSeconds: 60 };
      expect((await rateLimit(db, opts)).ok).toBe(true);
      expect((await rateLimit(db, opts)).ok).toBe(true);
      const third = await rateLimit(db, opts);
      expect(third.ok).toBe(false);
      expect(third.remaining).toBe(0);
    });

    it("keeps separate counters per key", async () => {
      await rateLimit(db, { key: "a", limit: 1, windowSeconds: 60 });
      expect((await rateLimit(db, { key: "b", limit: 1, windowSeconds: 60 })).ok).toBe(true);
    });

    it("resets after the window", async () => {
      const opts = { key: "short", limit: 1, windowSeconds: 1 };
      await rateLimit(db, opts);
      expect((await rateLimit(db, opts)).ok).toBe(false);
      await new Promise((r) => setTimeout(r, 1100));
      expect((await rateLimit(db, opts)).ok).toBe(true);
    });
  });
});
