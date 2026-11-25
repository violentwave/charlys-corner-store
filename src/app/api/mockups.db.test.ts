// @vitest-environment node
/**
 * Route tests for POST /api/mockups (the builder email gate), against real Postgres
 * with the memory storage driver and the console email driver.
 */
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { schema, type Db } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { _memoryClear, _memoryKeys } from "@/lib/storage";
import { upsertLead } from "@/lib/leads";
import { hasTestDb, setupTestDb } from "@/test/db";
import { POST as postQuote } from "./mockups/[id]/quote/route";
import { POST as postMockup } from "./mockups/route";

let forwardedFor = "198.51.100.1";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": forwardedFor }) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn().mockResolvedValue({ ok: true }) }));
// Spy that passes through by default; the insert-failure test rejects it once.
vi.mock("@/lib/leads", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/leads")>();
  return { ...mod, upsertLead: vi.fn(mod.upsertLead) };
});

const png = readFileSync("tests/fixtures/tiny.png");
const blob = (b: Uint8Array, type = "image/png") =>
  new Blob([b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer], { type });

const basePayload = {
  email: "charly@example.com",
  name: "Charly",
  phone: "",
  marketingOptIn: false,
  garment: "tshirt",
  colors: { body: "#ffffff" },
  views: [
    {
      view: "front",
      printArea: "full-front",
      transform: { x: 344, y: 292, width: 312, height: 364, rotation: 0, flipX: false },
    },
    {
      view: "back",
      printArea: "full-back",
      transform: { x: 344, y: 262, width: 312, height: 364, rotation: 0, flipX: false },
    },
  ],
  sizes: { M: 2 },
  notes: "SECRETNOTES-please-ignore",
  wantsQuote: false,
};

const buildRequest = (
  {
    payload = {},
    views = ["front", "back"],
    website = "",
    artwork = blob(png),
    renderBytes = png,
  }: {
    payload?: Record<string, unknown>;
    views?: string[];
    website?: string;
    artwork?: Blob;
    renderBytes?: Uint8Array;
  } = { views: ["front", "back"] },
) => {
  const form = new FormData();
  form.append("payload", JSON.stringify({ ...basePayload, ...payload }));
  form.append("turnstileToken", "tok");
  form.append("website", website);
  form.append("artwork", artwork, "art.png");
  for (const view of views) form.append(`mockup-${view}`, blob(renderBytes), `mockup-${view}.png`);
  return new Request("http://test/api/mockups", { method: "POST", body: form });
};

describe.skipIf(!hasTestDb)("POST /api/mockups (real Postgres)", () => {
  let db: Db;
  let reset: () => Promise<void>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.EMAIL_DRIVER = "console";
    process.env.STORAGE_DRIVER = "memory";
    ({ db, reset, close } = await setupTestDb());
  });
  beforeEach(async () => {
    await reset();
    _clearOutbox();
    _memoryClear();
    forwardedFor = "198.51.100.1";
    vi.mocked(upsertLead).mockClear();
  });
  afterAll(async () => close());

  it("happy path: lead + coupon + mockup row + 1 artwork and N renders stored", async () => {
    const res = await postMockup(buildRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: true; mockupId: string; coupon: { code: string; isNew: boolean } };

    expect(json.coupon.code).toMatch(/^CHARLY-/);
    expect(json.coupon.isNew).toBe(true);

    const mockupRows = await db.select().from(schema.mockups);
    expect(mockupRows).toHaveLength(1);
    expect(mockupRows[0]!.garment).toBe("tshirt");
    expect(mockupRows[0]!.notes).toBe("SECRETNOTES-please-ignore");
    expect(mockupRows[0]!.wantsQuote).toBe(false);
    expect(mockupRows[0]!.views).toHaveLength(2);
    for (const view of mockupRows[0]!.views) expect(view.mockupKey).toMatch(/^mockups\//);
    expect(mockupRows[0]!.couponId).toBeTruthy();

    expect(await db.select().from(schema.leads)).toHaveLength(1);
    const coupons = await db.select().from(schema.coupons);
    expect(coupons).toHaveLength(1);
    expect(coupons[0]!.code).toBe(json.coupon.code);

    // 1 original artwork + 2 rendered mockups.
    expect(_memoryKeys()).toHaveLength(3);
  });

  it("same email again reuses the coupon code (isNew false) and creates a second mockup", async () => {
    const first = await postMockup(buildRequest());
    expect(first.status).toBe(200);
    const second = await postMockup(
      buildRequest({ payload: { email: "CHARLY@example.com", views: [basePayload.views[0]] }, views: ["front"] }),
    );
    expect(second.status).toBe(200);
    const json = (await second.json()) as { coupon: { code: string; isNew: boolean } };
    expect(json.coupon.isNew).toBe(false);

    const coupons = await db.select().from(schema.coupons);
    expect(coupons).toHaveLength(1);
    const rows = await db.select().from(schema.mockups);
    expect(rows).toHaveLength(2);
  });

  it("bad payload returns 400 with fieldErrors", async () => {
    const res = await postMockup(buildRequest({ payload: { email: "not-an-email" } }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; fieldErrors: Record<string, string> };
    expect(json.fieldErrors.email).toBeTruthy();
  });

  it("invalid JSON payload returns 400", async () => {
    const form = new FormData();
    form.append("payload", "{not json");
    const res = await postMockup(new Request("http://test/api/mockups", { method: "POST", body: form }));
    expect(res.status).toBe(400);
  });

  it("missing mockup file for a listed view returns 400 and stores nothing", async () => {
    const res = await postMockup(buildRequest({ views: ["front"] }));
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toHaveLength(0);
    expect(await db.select().from(schema.mockups)).toHaveLength(0);
  });

  it("extra unexpected mockup file returns 400", async () => {
    const res = await postMockup(
      buildRequest({ payload: { views: [basePayload.views[0]] }, views: ["front", "back"] }),
    );
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("artwork PDF returns 400 (not drawable on the mockup)", async () => {
    const pdf = blob(new TextEncoder().encode("%PDF-1.4 test"), "application/pdf");
    const res = await postMockup(buildRequest({ artwork: pdf }));
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("oversize render returns 400", async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    const res = await postMockup(buildRequest({ renderBytes: big }));
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("insert failure deletes the stored files", async () => {
    vi.mocked(upsertLead).mockRejectedValueOnce(new Error("boom"));
    const res = await postMockup(buildRequest());
    expect(res.status).toBe(500);
    expect(_memoryKeys()).toHaveLength(0);
    expect(await db.select().from(schema.mockups)).toHaveLength(0);
  });

  it("honeypot returns a fake success and stores nothing", async () => {
    const res = await postMockup(buildRequest({ website: "http://spam.example" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: true };
    expect(json.ok).toBe(true);
    expect(_memoryKeys()).toHaveLength(0);
    expect(await db.select().from(schema.mockups)).toHaveLength(0);
    expect(await db.select().from(schema.leads)).toHaveLength(0);
  });

  it("rate limit returns 429 after 5 per hour per IP", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = (await postMockup(buildRequest({ payload: { email: `charly-${i}@example.com` } }))) as Response;
    }
    expect(last!.status).toBe(429);
    expect((await db.select().from(schema.mockups)).length).toBeLessThanOrEqual(5);
  });

  it("customer email never echoes the notes, owner email does", async () => {
    await postMockup(buildRequest({ payload: { wantsQuote: true } }));
    const customer = _outbox().find((m) => m.to === "charly@example.com")!;
    expect(customer).toBeTruthy();
    expect(customer.subject).toContain("Your Charly's mockup is ready");
    expect(customer.html + customer.text).not.toContain("SECRETNOTES-please-ignore");
    expect(customer.html + customer.text).toContain("Have a Ruffin awesome day");

    const owner = _outbox().find((m) => m.to !== "charly@example.com")!;
    expect(owner.subject).toContain("New mockup lead: T-Shirt · charly@example.com");
    expect(owner.subject).toContain("QUOTE REQUESTED");
    expect(owner.html + owner.text).toContain("SECRETNOTES-please-ignore");
    expect(owner.html + owner.text).toMatch(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/);
  });

  it("emails name the colors and attach the rendered PNGs", async () => {
    await postMockup(buildRequest({ payload: { name: "", colors: { body: "#263147" } } }));
    const customer = _outbox().find((m) => m.to === "charly@example.com")!;
    expect(customer.text).toContain("T-Shirt in Navy");
    expect(customer.text).toContain("Hi there,");
    expect(customer.attachments?.map((a) => a.filename)).toEqual([
      "charlys-mockup-tshirt-front.png",
      "charlys-mockup-tshirt-back.png",
    ]);
    const owner = _outbox().find((m) => m.to !== "charly@example.com")!;
    expect(owner.text).toContain("Shirt: Navy (#263147)");
  });

  it("rejects renders with absurd pixel dimensions", async () => {
    const huge = new Uint8Array(png);
    new DataView(huge.buffer).setUint32(16, 50_000);
    const res = await postMockup(buildRequest({ renderBytes: huge }));
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toEqual([]);
  });

  it("intent 'order' needs sizes, is stored as an order, and flags the owner email", async () => {
    expect((await postMockup(buildRequest({ payload: { intent: "order", sizes: {} } }))).status).toBe(400);
    expect((await postMockup(buildRequest({ payload: { intent: "order", sizes: { L: 3 } } }))).status).toBe(200);
    const [row] = await db.select().from(schema.mockups);
    expect(row!.kind).toBe("order");
    const owner = _outbox().find((m) => m.to !== "charly@example.com")!;
    expect(owner.subject).toBe("ORDER REQUEST: T-Shirt · charly@example.com");
  });

  it("rejects colors that aren't real blanks for the garment", async () => {
    const res = await postMockup(buildRequest({ payload: { colors: { body: "#ff2e97" } } }));
    expect(res.status).toBe(400);
  });

  describe("POST /api/mockups/[id]/quote", () => {
    const quote = (id: string) =>
      postQuote(
        new Request(`http://test/api/mockups/${id}/quote`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ turnstileToken: "tok" }),
        }),
        { params: Promise.resolve({ id }) },
      );

    it("flags the mockup once, notifies only the owner, and is idempotent", async () => {
      const sent = (await (await postMockup(buildRequest())).json()) as { mockupId: string };
      _clearOutbox();

      expect((await quote(sent.mockupId)).status).toBe(200);
      const [row] = await db.select().from(schema.mockups);
      expect(row!.wantsQuote).toBe(true);
      expect(_outbox()).toHaveLength(1);
      expect(_outbox()[0]!.subject).toContain("Quote requested: T-Shirt · charly@example.com");
      expect(_outbox()[0]!.to).not.toBe("charly@example.com");

      expect((await quote(sent.mockupId)).status).toBe(200);
      expect(_outbox()).toHaveLength(1);
      expect(await db.select().from(schema.mockups)).toHaveLength(1);
    });

    it("404s for malformed and unknown ids", async () => {
      expect((await quote("not-a-uuid")).status).toBe(404);
      expect((await quote("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    });
  });
});
