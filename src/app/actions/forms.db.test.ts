// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

import { _clearOutbox, _outbox } from "@/lib/email";
import { hasTestDb, setupTestDb } from "@/test/db";
import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { submitContact } from "./contact";
import { submitSurvey } from "./survey";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn().mockResolvedValue({ ok: true }),
}));

describe.skipIf(!hasTestDb)("forms submit (real Postgres)", () => {
  let db: Db;
  let reset: () => Promise<void>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.EMAIL_DRIVER = "console";
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    ({ db, reset, close } = await setupTestDb());
  });
  beforeEach(async () => {
    await reset();
    _clearOutbox();
    vi.mocked(verifyTurnstile).mockResolvedValue({ ok: true });
  });
  afterAll(async () => close());

  it("submitContact happy path creates rows and sends 2 emails", async () => {
    const res = await submitContact(
      { name: "Logan", email: "logan@example.com", message: "Hi there" },
      "contact",
      "token",
    );
    expect(res.ok).toBe(true);
    const leads = await db.select().from(schema.leads);
    expect(leads).toHaveLength(1);
    const msgs = await db.select().from(schema.contactMessages);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].sourcePage).toBe("contact");
    expect(_outbox()).toHaveLength(2);
  });

  it("submitContact rejects invalid input", async () => {
    const res = await submitContact({ name: "", email: "nope", message: "" }, "about", "token");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors).toBeDefined();
    const msgs = await db.select().from(schema.contactMessages);
    expect(msgs).toHaveLength(0);
  });

  it("submitContact rejects bad turnstile token", async () => {
    vi.mocked(verifyTurnstile).mockResolvedValueOnce({ ok: false, error: "bad" });
    const res = await submitContact({ name: "A", email: "a@b.co", message: "hi" }, "contact", "token");
    expect(res.ok).toBe(false);
    const msgs = await db.select().from(schema.contactMessages);
    expect(msgs).toHaveLength(0);
  });

  it("submitContact honeypot stores nothing", async () => {
    const res = await submitContact(
      { name: "Bot", email: "bot@x.com", message: "spam", website: "http://spam" },
      "contact",
      "token",
    );
    expect(res.ok).toBe(true);
    const msgs = await db.select().from(schema.contactMessages);
    expect(msgs).toHaveLength(0);
    const leads = await db.select().from(schema.leads);
    expect(leads).toHaveLength(0);
  });

  it("submitContact rate limits after 5", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await submitContact({ name: "A", email: `a${i}@b.co`, message: "hi" }, "contact", "token");
      expect(r.ok).toBe(true);
    }
    const sixth = await submitContact({ name: "A", email: "a6@b.co", message: "hi" }, "contact", "token");
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.error).toMatch(/Too many/);
  });

  it("submitSurvey creates a survey_responses row", async () => {
    const res = await submitSurvey({ referralSource: "friend" }, "token");
    expect(res.ok).toBe(true);
    const rows = await db.select().from(schema.surveyResponses);
    expect(rows).toHaveLength(1);
    expect(rows[0].page).toBe("home");
  });

  it("submitSurvey rejects invalid input", async () => {
    const res = await submitSurvey({ referralSource: "other" }, "token");
    expect(res.ok).toBe(false);
  });
});
