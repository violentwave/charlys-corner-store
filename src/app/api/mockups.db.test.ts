// @vitest-environment node
/**
 * Route tests for POST /api/mockups (the builder send step, v2), against real Postgres
 * with the memory storage driver and the console email driver. A verified account is
 * required: identity (email/name/lead/user_id) comes from the session, not the payload.
 */
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { schema, type Db } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { _memoryClear, _memoryKeys } from "@/lib/storage";
import { upsertLead } from "@/lib/leads";
import { hasTestDb, setupTestDb } from "@/test/db";
import { POST as postMockup } from "./mockups/route";

// The session cookie the route reads via cookies() — set by createVerifiedUser() below.
const sessionCookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
let forwardedFor = "198.51.100.1";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": forwardedFor }),
  cookies: async () => ({
    get: (name: string) =>
      name === "ccs_session" && sessionCookie.value ? { name, value: sessionCookie.value } : undefined,
  }),
}));
// Spy that passes through by default; the insert-failure test rejects it once.
vi.mock("@/lib/leads", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/leads")>();
  return { ...mod, upsertLead: vi.fn(mod.upsertLead) };
});

const png = readFileSync("tests/fixtures/tiny.png");
const blob = (b: Uint8Array, type = "image/png") =>
  new Blob([b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer], { type });

const basePayload = {
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
};

const buildRequest = (
  {
    payload = {},
    views = ["front", "back"],
    website = "",
    artwork = blob(png),
    renderBytes = png,
    artworkFields,
  }: {
    payload?: Record<string, unknown>;
    views?: string[];
    website?: string;
    artwork?: Blob;
    renderBytes?: Uint8Array;
    /** Per-view files as artwork-<n> (replaces the single legacy "artwork" field). */
    artworkFields?: Record<string, Blob>;
  } = { views: ["front", "back"] },
) => {
  const form = new FormData();
  form.append("payload", JSON.stringify({ ...basePayload, ...payload }));
  form.append("website", website);
  if (artworkFields)
    for (const [field, file] of Object.entries(artworkFields)) form.append(field, file, `${field}.png`);
  else form.append("artwork", artwork, "art.png");
  for (const view of views) form.append(`mockup-${view}`, blob(renderBytes), `mockup-${view}.png`);
  return new Request("http://test/api/mockups", { method: "POST", body: form });
};

describe.skipIf(!hasTestDb)("POST /api/mockups (real Postgres)", () => {
  let db: Db;
  let reset: () => Promise<void>;
  let close: () => Promise<void>;

  /** A verified account with a session; sets the cookie the route reads. Returns the user id. */
  async function createVerifiedUser(email: string, name: string | null = "Charly"): Promise<string> {
    const leadId = await upsertLead(db, { email, name });
    const passwordHash = await hashPassword("fixture-credentials-only");
    const [row] = await db
      .insert(schema.users)
      .values({ email, passwordHash, name, emailVerifiedAt: new Date(), leadId })
      .returning({ id: schema.users.id });
    const { token } = await createSession(db, row!.id);
    sessionCookie.value = token;
    return row!.id;
  }

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
    sessionCookie.value = undefined;
    vi.mocked(upsertLead).mockClear();
  });
  afterAll(async () => close());

  it("requires an account: signed out is 401", async () => {
    const res = await postMockup(buildRequest());
    expect(res.status).toBe(401);
    const json = (await res.json()) as { ok: false; error: string };
    expect(json.error).toMatch(/log in or create an account/i);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("refuses cross-site POSTs before anything else (CSRF)", async () => {
    const req = buildRequest();
    const crossSite = new Request(req, { headers: { origin: "https://evil.example", host: "test" } });
    const res = await postMockup(crossSite);
    expect(res.status).toBe(403);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("requires a verified email: unverified is 403", async () => {
    // Same shape as a fresh signup: a user whose email hasn't been confirmed yet.
    const leadId = await upsertLead(db, { email: "unverified@example.com", name: "Charly" });
    const passwordHash = await hashPassword("fixture-credentials-only");
    const [row] = await db
      .insert(schema.users)
      .values({ email: "unverified@example.com", passwordHash, name: "Charly", leadId })
      .returning({ id: schema.users.id });
    const { token } = await createSession(db, row!.id);
    sessionCookie.value = token;

    const res = await postMockup(buildRequest());
    expect(res.status).toBe(403);
    const json = (await res.json()) as { ok: false; error: string };
    expect(json.error).toMatch(/confirm your email/i);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("happy path: account identity on the lead + row, coupon, files stored", async () => {
    const userId = await createVerifiedUser("charly@example.com", "Charly Dog");
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
    expect(mockupRows[0]!.userId).toBe(userId);
    expect(mockupRows[0]!.kind).toBe("mockup");
    expect(mockupRows[0]!.views).toHaveLength(2);
    for (const view of mockupRows[0]!.views) expect(view.mockupKey).toMatch(/^mockups\//);
    expect(mockupRows[0]!.couponId).toBeTruthy();

    const leads = await db.select().from(schema.leads);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.email).toBe("charly@example.com");
    expect(leads[0]!.name).toBe("Charly Dog");
    const coupons = await db.select().from(schema.coupons);
    expect(coupons).toHaveLength(1);
    expect(coupons[0]!.code).toBe(json.coupon.code);

    // 1 original artwork + 2 rendered mockups.
    expect(_memoryKeys()).toHaveLength(3);
  });

  it("sending again from the same account reuses the coupon code (isNew false)", async () => {
    await createVerifiedUser("charly@example.com");
    const first = await postMockup(buildRequest());
    expect(first.status).toBe(200);
    const second = await postMockup(buildRequest({ payload: { views: [basePayload.views[0]] }, views: ["front"] }));
    expect(second.status).toBe(200);
    const json = (await second.json()) as { coupon: { code: string; isNew: boolean } };
    expect(json.coupon.isNew).toBe(false);

    const coupons = await db.select().from(schema.coupons);
    expect(coupons).toHaveLength(1);
    const rows = await db.select().from(schema.mockups);
    expect(rows).toHaveLength(2);
  });

  it("bad payload returns 400 with fieldErrors", async () => {
    await createVerifiedUser("charly@example.com");
    const res = await postMockup(buildRequest({ payload: { colors: { body: "#ff2e97" } } }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; fieldErrors: Record<string, string> };
    expect(json.fieldErrors["colors.body"]).toBeTruthy();
  });

  it("invalid JSON payload returns 400", async () => {
    await createVerifiedUser("charly@example.com");
    const form = new FormData();
    form.append("payload", "{not json");
    const res = await postMockup(new Request("http://test/api/mockups", { method: "POST", body: form }));
    expect(res.status).toBe(400);
  });

  it("missing mockup file for a listed view returns 400 and stores nothing", async () => {
    await createVerifiedUser("charly@example.com");
    const res = await postMockup(buildRequest({ views: ["front"] }));
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toHaveLength(0);
    expect(await db.select().from(schema.mockups)).toHaveLength(0);
  });

  it("extra unexpected mockup file returns 400", async () => {
    await createVerifiedUser("charly@example.com");
    const res = await postMockup(
      buildRequest({ payload: { views: [basePayload.views[0]] }, views: ["front", "back"] }),
    );
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("artwork PDF returns 400 (not drawable on the mockup)", async () => {
    await createVerifiedUser("charly@example.com");
    const pdf = blob(new TextEncoder().encode("%PDF-1.4 test"), "application/pdf");
    const res = await postMockup(buildRequest({ artwork: pdf }));
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("oversize render returns 400", async () => {
    await createVerifiedUser("charly@example.com");
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    const res = await postMockup(buildRequest({ renderBytes: big }));
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it("insert failure deletes the stored files", async () => {
    await createVerifiedUser("charly@example.com");
    vi.mocked(upsertLead).mockRejectedValueOnce(new Error("boom"));
    const res = await postMockup(buildRequest());
    expect(res.status).toBe(500);
    expect(_memoryKeys()).toHaveLength(0);
    expect(await db.select().from(schema.mockups)).toHaveLength(0);
  });

  it("honeypot returns a fake success and stores nothing", async () => {
    await createVerifiedUser("charly@example.com");
    const res = await postMockup(buildRequest({ website: "http://spam.example" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: true };
    expect(json.ok).toBe(true);
    expect(_memoryKeys()).toHaveLength(0);
    expect(await db.select().from(schema.mockups)).toHaveLength(0);
    // The account's own lead exists (created at verification); no coupon was issued for a bot.
    expect(await db.select().from(schema.coupons)).toHaveLength(0);
  });

  it("rate limit per account: 429 on the 4th send in a day", async () => {
    await createVerifiedUser("charly@example.com");
    let last: Response | undefined;
    for (let i = 0; i < 4; i++) {
      last = (await postMockup(
        buildRequest({ payload: { views: [basePayload.views[0]] }, views: ["front"] }),
      )) as Response;
    }
    expect(last!.status).toBe(429);
    expect(await db.select().from(schema.mockups)).toHaveLength(3);
  });

  it("rate limit per IP: 429 after 5 sends an hour even from different accounts", async () => {
    for (let i = 0; i < 6; i++) {
      sessionCookie.value = undefined;
      await createVerifiedUser(`charly-${i}@example.com`);
      const res = await postMockup(buildRequest({ payload: { views: [basePayload.views[0]] }, views: ["front"] }));
      if (i < 5) expect(res.status).toBe(200);
      else expect(res.status).toBe(429);
    }
    expect((await db.select().from(schema.mockups)).length).toBeLessThanOrEqual(5);
  });

  it("mockup email never echoes the notes, owner email does", async () => {
    await createVerifiedUser("charly@example.com");
    await postMockup(buildRequest());
    const customer = _outbox().find((m) => m.to === "charly@example.com")!;
    expect(customer).toBeTruthy();
    expect(customer.subject).toContain("Your Charly's mockup is ready");
    expect(customer.html + customer.text).not.toContain("SECRETNOTES-please-ignore");
    expect(customer.html + customer.text).toContain("Have a Ruffin awesome day");

    const owner = _outbox().find((m) => m.to !== "charly@example.com")!;
    expect(owner.subject).toContain("New mockup lead: T-Shirt · charly@example.com");
    expect(owner.html + owner.text).toContain("SECRETNOTES-please-ignore");
    expect(owner.html + owner.text).toMatch(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/);
  });

  it("emails name the colors and attach the rendered PNGs", async () => {
    await createVerifiedUser("charly@example.com", null);
    await postMockup(buildRequest({ payload: { colors: { body: "#263147" } } }));
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
    await createVerifiedUser("charly@example.com");
    const huge = new Uint8Array(png);
    new DataView(huge.buffer).setUint32(16, 50_000);
    const res = await postMockup(buildRequest({ renderBytes: huge }));
    expect(res.status).toBe(400);
    expect(_memoryKeys()).toEqual([]);
  });

  it("intent 'order' is stored as an order and gets the order-request email with the coupon", async () => {
    await createVerifiedUser("charly@example.com", "Charly Dog");
    expect((await postMockup(buildRequest({ payload: { intent: "order", sizes: {} } }))).status).toBe(400);
    _clearOutbox();
    const res = await postMockup(buildRequest({ payload: { intent: "order", sizes: { L: 3 } } }));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(schema.mockups);
    expect(row!.kind).toBe("order");

    const customer = _outbox().find((m) => m.to === "charly@example.com")!;
    expect(customer.subject).toBe("We got your order request 🐾");
    expect(customer.html + customer.text).toContain("confirm the price and send you an invoice");
    expect(customer.html + customer.text).toContain("3 × L");
    expect(customer.html + customer.text).toMatch(/CHARLY-[A-Z2-9]{4}-[A-Z2-9]{4}/);
    expect(customer.html + customer.text).not.toContain("SECRETNOTES-please-ignore");

    const owner = _outbox().find((m) => m.to !== "charly@example.com")!;
    expect(owner.subject).toBe("ORDER REQUEST: T-Shirt · charly@example.com");
  });

  it("rejects colors that aren't real blanks for the garment", async () => {
    await createVerifiedUser("charly@example.com");
    const res = await postMockup(buildRequest({ payload: { colors: { body: "#ff2e97" } } }));
    expect(res.status).toBe(400);
  });

  describe("separate artwork per side (artwork-<n>)", () => {
    const sides = (front: number, back: number) => ({
      views: [
        { ...basePayload.views[0], artwork: front },
        { ...basePayload.views[1], artwork: back },
      ],
    });

    it("stores a different file for the back and records which side uses which", async () => {
      await createVerifiedUser("sides@example.com");
      const res = await postMockup(
        buildRequest({ payload: sides(0, 1), artworkFields: { "artwork-0": blob(png), "artwork-1": blob(png) } }),
      );
      expect(res.status).toBe(200);
      const [row] = await db.select().from(schema.mockups);
      expect(row!.artworks).toHaveLength(2);
      expect(row!.views.map((v) => v.artwork)).toEqual([0, 1]);
      expect(row!.artworkKey).toBe(row!.artworks[0]!.key);
      expect(_memoryKeys()).toHaveLength(2 + 2); // two originals + two renders
      const owner = _outbox().find((m) => m.to !== "sides@example.com")!;
      expect(owner.text).toContain("Original artwork (2 files)");
    });

    it("the same file on both sides is stored once", async () => {
      await createVerifiedUser("same@example.com");
      const res = await postMockup(buildRequest({ payload: sides(0, 0), artworkFields: { "artwork-0": blob(png) } }));
      expect(res.status).toBe(200);
      const [row] = await db.select().from(schema.mockups);
      expect(row!.artworks).toHaveLength(1);
    });

    it("rejects missing, extra and gappy artwork files before storing anything", async () => {
      await createVerifiedUser("gaps@example.com");
      const missing = await postMockup(
        buildRequest({ payload: sides(0, 1), artworkFields: { "artwork-0": blob(png) } }),
      );
      expect(missing.status).toBe(400);
      const extra = await postMockup(
        buildRequest({ payload: sides(0, 0), artworkFields: { "artwork-0": blob(png), "artwork-1": blob(png) } }),
      );
      expect(extra.status).toBe(400);
      const gappy = await postMockup(
        buildRequest({ payload: sides(0, 2), artworkFields: { "artwork-0": blob(png), "artwork-2": blob(png) } }),
      );
      expect(gappy.status).toBe(400);
      expect(_memoryKeys()).toEqual([]);
    });

    it("sleeve views work on long-sleeve garments only", async () => {
      await createVerifiedUser("sleeve@example.com");
      const sleeve = {
        view: "left",
        printArea: "full-sleeve",
        transform: { x: 425, y: 230, width: 150, height: 300, rotation: 0, flipX: false },
      };
      const ok = await postMockup(
        buildRequest({
          payload: { garment: "longsleeve", colors: { body: "#263147" }, views: [sleeve] },
          views: ["left"],
        }),
      );
      expect(ok.status).toBe(200);
      const tee = await postMockup(buildRequest({ payload: { views: [sleeve] }, views: ["left"] }));
      expect(tee.status).toBe(400);
    });

    it("combo blanks must be a real combo", async () => {
      await createVerifiedUser("combo@example.com");
      const front = { ...basePayload.views[0], printArea: "full-front" };
      const mixed = await postMockup(
        buildRequest({
          payload: { garment: "raglan", colors: { body: "#ffffff", sleeves: "#263147" }, views: [front] },
          views: ["front"],
        }),
      );
      expect(mixed.status).toBe(400);
      const real = await postMockup(
        buildRequest({
          payload: { garment: "raglan", colors: { body: "#ffffff", sleeves: "#1e2a44" }, views: [front] },
          views: ["front"],
        }),
      );
      expect(real.status).toBe(200);
    });
  });
});
