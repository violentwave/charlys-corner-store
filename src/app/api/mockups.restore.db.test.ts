// @vitest-environment node
/**
 * Route tests for GET /api/mockups/[id] (the restore-design deep link), against
 * real Postgres with the memory storage driver. The endpoint must return design
 * data only — never email, name, phone, notes, coupon, or lead id.
 */
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { schema, type Db } from "@/lib/db";
import { _memoryClear } from "@/lib/storage";
import { hasTestDb, setupTestDb } from "@/test/db";
import { GET as getRestore } from "@/app/api/mockups/[id]/route";

let forwardedFor = "198.51.100.1";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": forwardedFor }) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn().mockResolvedValue({ ok: true }) }));

const png = readFileSync("tests/fixtures/tiny.png");
const blob = (b: Uint8Array, type = "image/png") =>
  new Blob([b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer], { type });

const postMockup = async (payloadOverride: Record<string, unknown> = {}) => {
  const { POST } = await import("@/app/api/mockups/route");
  const basePayload = {
    email: "charly@example.com",
    name: "Charly Customer",
    phone: "772-555-0100",
    marketingOptIn: false,
    garment: "tshirt",
    colors: { body: "#2233aa" },
    views: [
      {
        view: "front",
        printArea: "full-front",
        transform: { x: 344, y: 292, width: 312, height: 364, rotation: 15, flipX: false },
      },
    ],
    sizes: { M: 2 },
    notes: "SECRETNOTES-please-ignore",
    wantsQuote: false,
  };
  const form = new FormData();
  form.append("payload", JSON.stringify({ ...basePayload, ...payloadOverride }));
  form.append("turnstileToken", "tok");
  form.append("website", "");
  form.append("artwork", blob(png), "art.png");
  form.append("mockup-front", blob(png), "mockup-front.png");
  return POST(new Request("http://test/api/mockups", { method: "POST", body: form }));
};

describe.skipIf(!hasTestDb)("GET /api/mockups/[id] (real Postgres)", () => {
  let db: Db;
  let reset: () => Promise<void>;
  let close: () => Promise<void>;
  let mockupId: string;
  let artworkKey: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.EMAIL_DRIVER = "console";
    process.env.STORAGE_DRIVER = "memory";
    ({ db, reset, close } = await setupTestDb());
  });
  beforeEach(async () => {
    await reset();
    _memoryClear();
    forwardedFor = "198.51.100.1";
    const res = await postMockup();
    const json = (await res.json()) as { ok: true; mockupId: string };
    mockupId = json.mockupId;
    const [row] = await db.select().from(schema.mockups);
    artworkKey = row!.artworkKey;
  });
  afterAll(async () => close());

  it("returns design data only (exact key set, no PII)", async () => {
    const res = await getRestore(new Request(`http://test/api/mockups/${mockupId}`), {
      params: Promise.resolve({ id: mockupId }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      design: { garment: string; colors: Record<string, string>; views: Record<string, unknown>[]; sizes: Record<string, number> };
      artwork: { url: string };
    };

    // Exact key set: nothing extra (mockupKey, mockupId, lead/coupon fields, …).
    expect(Object.keys(json).sort()).toEqual(["artwork", "design", "ok"]);
    expect(Object.keys(json.design as object).sort()).toEqual(["colors", "garment", "sizes", "views"]);
    expect(Object.keys(json.artwork as object)).toEqual(["url"]);
    const views = json.design.views as Record<string, unknown>[];
    expect(views.map((v) => Object.keys(v).sort())).toEqual([["printArea", "transform", "view"]]);
    // The design itself round-trips.
    expect(json.design).toMatchObject({
      garment: "tshirt",
      colors: { body: "#2233aa" },
      sizes: { M: 2 },
      views: [
        {
          view: "front",
          printArea: "full-front",
          transform: { x: 344, y: 292, width: 312, height: 364, rotation: 15, flipX: false },
        },
      ],
    });

    // Artwork URL points at the stored original (memory driver: memory://<key>).
    expect(json.artwork.url).toBe(`memory://${artworkKey}`);

    // Nothing personally identifying anywhere in the body.
    const body = JSON.stringify(json);
    for (const pii of [
      "charly@example.com",
      "Charly Customer",
      "772-555-0100",
      "SECRETNOTES-please-ignore",
      '"leadId"',
      '"email"',
      '"name"',
      '"phone"',
      '"notes"',
      '"coupon"',
    ]) {
      expect(body).not.toContain(pii);
    }
  });

  it("400 for a non-UUID id", async () => {
    for (const bad of ["not-a-uuid", "123", "123e4567-e89b-12d3-a456-42661417400z"]) {
      const res = await getRestore(new Request(`http://test/api/mockups/${bad}`), {
        params: Promise.resolve({ id: bad }),
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { ok: false };
      expect(json.ok).toBe(false);
    }
  });

  it("404 for an unknown but well-formed UUID", async () => {
    const res = await getRestore(
      new Request("http://test/api/mockups/123e4567-e89b-42d3-a456-426614174999"),
      { params: Promise.resolve({ id: "123e4567-e89b-42d3-a456-426614174999" }) },
    );
    expect(res.status).toBe(404);
  });

  it("rate limit: 30 per hour per IP, then 429", async () => {
    const unknownId = "123e4567-e89b-42d3-a456-426614174999";
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) {
      last = await getRestore(new Request(`http://test/api/mockups/${unknownId}`), {
        params: Promise.resolve({ id: unknownId }),
      });
    }
    expect(last!.status).toBe(429);

    // A different IP is unaffected.
    forwardedFor = "198.51.100.2";
    const fresh = await getRestore(new Request(`http://test/api/mockups/${unknownId}`), {
      params: Promise.resolve({ id: unknownId }),
    });
    expect(fresh.status).toBe(404);
  });
});
