// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

import { hasTestDb, setupTestDb } from "@/test/db";
import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";
import { _memoryObject } from "@/lib/storage";
import { POST as postUpload } from "./route";
import { POST as postQuote } from "../quotes/route";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }),
}));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn().mockResolvedValue({ ok: true }),
}));

const png = readFileSync("tests/fixtures/tiny.png");
const fake = readFileSync("tests/fixtures/not-an-image.png");

function uploadForm(bytes: Uint8Array = png, overrides: Record<string, string> = {}) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const file = new Blob([buffer], { type: "image/png" });
  const form = new FormData();
  const values = {
    firstName: "Charly",
    lastName: "Dog",
    email: "charly@example.com",
    orderNumber: "ORD-123",
    notes: "Front print",
    turnstileToken: "token",
    website: "",
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) form.append(k, v);
  form.append("file", file, "artwork.png");
  return form;
}

describe.skipIf(!hasTestDb)("upload/quote route handlers (real Postgres)", () => {
  let db: Db;
  let reset: () => Promise<void>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.EMAIL_DRIVER = "console";
    process.env.STORAGE_DRIVER = "memory";
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    ({ db, reset, close } = await setupTestDb());
  });
  beforeEach(async () => {
    await reset();
    _clearOutbox();
    vi.mocked(verifyTurnstile).mockResolvedValue({ ok: true });
  });
  afterAll(async () => close());

  it("valid upload stores object + row + 2 emails", async () => {
    const res = await postUpload(new Request("http://localhost/api/uploads", { method: "POST", body: uploadForm() }));
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.uploads);
    expect(rows).toHaveLength(1);
    expect(rows[0].orderNumber).toBe("ORD-123");
    expect(_memoryObject(rows[0].fileKey)).toBeDefined();
    expect(_outbox()).toHaveLength(2);
    expect(_outbox()[0].html).toContain("memory://");
  });

  it("rejects a text file renamed .png", async () => {
    const res = await postUpload(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        body: uploadForm(fake),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unsupported file/i);
    const rows = await db.select().from(schema.uploads);
    expect(rows).toHaveLength(0);
  });

  it("rejects Content-Length over 21 MB before reading", async () => {
    const res = await postUpload(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        headers: { "content-length": String(22 * 1024 * 1024) },
        body: "x",
      }),
    );
    expect(res.status).toBe(413);
  });

  it("stores nothing on honeypot", async () => {
    const res = await postUpload(
      new Request("http://localhost/api/uploads", { method: "POST", body: uploadForm(png, { website: "http://spam" }) }),
    );
    expect(res.status).toBe(200);
    expect(await db.select().from(schema.uploads)).toHaveLength(0);
  });

  it("rate limits uploads after 10", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await postUpload(
        new Request("http://localhost/api/uploads", { method: "POST", body: uploadForm(png, { email: `a${i}@b.co` }) }),
      );
      expect(res.status).toBe(200);
    }
    const res = await postUpload(
      new Request("http://localhost/api/uploads", { method: "POST", body: uploadForm(png, { email: "a11@b.co" }) }),
    );
    expect(res.status).toBe(429);
  });

  function quoteForm(files: File[] = []) {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      name: "Charly",
      email: "charly@example.com",
      items: "50 tees",
      turnstileToken: "token",
      website: "",
    })) {
      form.append(k, v);
    }
    for (const file of files) form.append("files", file, file.name);
    return form;
  }

  it("quote with 0 files works", async () => {
    const res = await postQuote(new Request("http://localhost/api/quotes", { method: "POST", body: quoteForm() }));
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.quotes);
    expect(rows).toHaveLength(1);
    expect(rows[0].artworkKeys).toEqual([]);
  });

  it("quote with 2 files stores both keys", async () => {
    const f1 = new File([png], "one.png", { type: "image/png" });
    const f2 = new File([png], "two.png", { type: "image/png" });
    const res = await postQuote(
      new Request("http://localhost/api/quotes", { method: "POST", body: quoteForm([f1, f2]) }),
    );
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.quotes);
    expect(rows[0].artworkKeys).toHaveLength(2);
  });
});
