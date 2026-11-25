// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { coupons, leads } from "../../db/schema";
import { hasTestDb, setupTestDb } from "@/test/db";
import { issueCoupon } from "./coupon-store";
import type { Db } from "./db";
import { upsertLead } from "./leads";

describe.skipIf(!hasTestDb)("issueCoupon (real Postgres)", () => {
  let db: Db;
  let reset: () => Promise<void>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, reset, close } = await setupTestDb());
  });
  beforeEach(async () => reset());
  afterAll(async () => close());

  it("issues one coupon per email and re-sends the same code", async () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const lead = await upsertLead(db, { email: "Fan@Example.com" });
    const first = await issueCoupon(db, lead, now);
    expect(first.isNew).toBe(true);
    expect(first.code).toMatch(/^CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(first.expiresAt.toISOString()).toBe("2027-11-25T12:00:00.000Z");

    const again = await issueCoupon(db, await upsertLead(db, { email: "fan@example.com" }));
    expect(again).toMatchObject({ id: first.id, code: first.code, isNew: false });
    expect(await db.select().from(coupons)).toHaveLength(1);
    const [row] = await db.select().from(coupons).where(eq(coupons.id, first.id));
    expect(row).toMatchObject({ percentOff: 15, minOrderCents: 3000, status: "issued" });
  });

  it("is race-safe under concurrent submits", async () => {
    const lead = await upsertLead(db, { email: "race@example.com" });
    const results = await Promise.all(Array.from({ length: 5 }, () => issueCoupon(db, lead)));
    expect(new Set(results.map((r) => r.code)).size).toBe(1);
    expect(results.filter((r) => r.isNew)).toHaveLength(1);
  });

  it("marketing opt-in only ever turns on", async () => {
    const id = await upsertLead(db, { email: "opt@example.com", marketingOptIn: true });
    await upsertLead(db, { email: "opt@example.com", marketingOptIn: false });
    const [row] = await db.select().from(leads).where(eq(leads.id, id));
    expect(row!.marketingOptIn).toBe(true);
  });
});
