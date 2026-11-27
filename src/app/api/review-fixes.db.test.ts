// @vitest-environment node
/** Regression tests for the Phase 3 review fixes (PR "fix(backend): Phase 3 review fixes"). */
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { submitContact } from "@/app/actions/contact";
import { schema, type Db } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { hasTestDb, setupTestDb } from "@/test/db";
import { POST as postQuote } from "./quotes/route";
import { POST as postUpload } from "./uploads/route";

let forwardedFor = "198.51.100.1";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": forwardedFor }) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn().mockResolvedValue({ ok: true }) }));

const png = readFileSync("tests/fixtures/tiny.png");
const fake = readFileSync("tests/fixtures/not-an-image.png");
const blob = (b: Uint8Array, type = "image/png") =>
  new Blob([b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer], { type });

const contact = (overrides: Record<string, unknown> = {}) => ({
  name: "Charly",
  email: "charly@example.com",
  message: "VISIT evil.example NOW",
  ...overrides,
});

describe.skipIf(!hasTestDb)("Phase 3 review fixes (real Postgres)", () => {
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
    forwardedFor = "198.51.100.1";
  });
  afterAll(async () => close());

  it("rejects a forged sourcePage (server actions are public endpoints)", async () => {
    const res = await submitContact(contact(), "<script>" as never, "tok");
    expect(res.ok).toBe(false);
    expect(await db.select().from(schema.contactMessages)).toHaveLength(0);
  });

  it("customer confirmation never echoes the visitor's message", async () => {
    await submitContact(contact(), "contact", "tok");
    const customer = _outbox().find((m) => m.to === "charly@example.com")!;
    expect(customer.html + customer.text).not.toContain("evil.example");
  });

  it("caps confirmations per recipient but still stores + notifies the owner", async () => {
    for (let i = 0; i < 4; i++) {
      forwardedFor = `198.51.100.${10 + i}`; // different IPs, same target address
      expect((await submitContact(contact(), "contact", "tok")).ok).toBe(true);
    }
    expect(await db.select().from(schema.contactMessages)).toHaveLength(4);
    const toCustomer = _outbox().filter((m) => m.to === "charly@example.com");
    const toOwner = _outbox().filter((m) => m.to !== "charly@example.com");
    expect(toOwner).toHaveLength(4);
    expect(toCustomer).toHaveLength(3);
  });

  it("rejects an oversized chunked upload without a Content-Length header", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ >= 33)
          controller.close(); // ~33 MB, over the 31 MB cap
        else controller.enqueue(chunk);
      },
    });
    const req = new Request("http://test/api/uploads", {
      method: "POST",
      body,
      headers: { "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    const res = await postUpload(req);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(33); // stopped reading early
  });

  it("quote with one good and one bad file stores nothing", async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ name: "A", email: "a@example.com", items: "50 tees", turnstileToken: "t" }))
      form.append(k, v);
    form.append("files", blob(png), "good.png");
    form.append("files", blob(fake), "bad.png");
    const res = await postQuote(new Request("http://test/api/quotes", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect(await db.select().from(schema.quotes)).toHaveLength(0);
  });

  it("quote rejects a non-date 'needed by' instead of crashing the insert", async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      name: "A",
      email: "a@example.com",
      items: "tees",
      neededBy: "asap",
      turnstileToken: "t",
    }))
      form.append(k, v);
    const res = await postQuote(new Request("http://test/api/quotes", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { fieldErrors: Record<string, string> }).fieldErrors.neededBy).toBeTruthy();
  });

  it("ignores an empty, nameless file part (untouched file input)", async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ name: "A", email: "a@example.com", items: "tees", turnstileToken: "t" }))
      form.append(k, v);
    form.append("files", new Blob([]), "");
    const res = await postQuote(new Request("http://test/api/quotes", { method: "POST", body: form }));
    expect(res.status).toBe(200);
  });
});
