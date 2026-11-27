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
    email: "charly@example.com",
    turnstileToken: "token",
    website: "",
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) form.append(k, v);
  form.append("files", file, "artwork.png");
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
    expect(rows[0].firstName).toBe("Charly");
    expect(rows[0].files).toHaveLength(1);
    expect(_memoryObject(rows[0].files[0].key)).toBeDefined();
    expect(_outbox()).toHaveLength(2);
  });

  const post = (form: FormData) => postUpload(new Request("http://localhost/api/uploads", { method: "POST", body: form }));
  function formOf(values: Record<string, string>, files: number = 0) {
    const form = new FormData();
    for (const [k, v] of Object.entries({ turnstileToken: "token", website: "", ...values })) form.append(k, v);
    for (let i = 0; i < files; i++) form.append("files", new Blob([new Uint8Array(png)], { type: "image/png" }), `a${i}.png`);
    return form;
  }

  it("guest new order with only first name + email (no files) is accepted", async () => {
    const res = await post(formOf({ firstName: "Pat", email: "pat@example.com" }));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(schema.uploads);
    expect(row).toMatchObject({ orderType: "new", firstName: "Pat", lastName: null, userId: null, files: [] });
    expect(row!.printMethod).toBe("recommend");
    expect(_outbox()).toHaveLength(2);
  });

  it("owner email lists every field (empty ones as —); customer email never echoes the notes", async () => {
    const notes = ["please", "use", "the", "big", "logo"].join(" ");
    const res = await post(
      formOf(
        {
          firstName: "Pat",
          email: "pat@example.com",
          fulfillment: "ship",
          street: "1 Ocean Dr",
          city: "Port St. Lucie",
          state: "fl",
          zip: "34952",
          items: JSON.stringify(["Hoodie", "T-Shirt"]),
          printMethod: "dtf",
          printLocations: JSON.stringify(["Front", "Back"]),
          sizes: JSON.stringify({ M: 3, XL: 2 }),
          notes,
        },
        2,
      ),
    );
    expect(res.status).toBe(200);
    const [row] = await db.select().from(schema.uploads);
    expect(row!.address).toMatchObject({ state: "FL", zip: "34952" });
    expect(row!.files).toHaveLength(2);
    const [owner, customer] = [_outbox().find((m) => m.subject.startsWith("NEW ORDER"))!, _outbox().find((m) => m.subject.startsWith("We got"))!];
    for (const label of ["Order type", "Last name", "Phone", "Company / team", "Order number", "Fulfillment", "Street", "Item types", "Print method", "Print locations", "Needed by", "Notes"]) {
      expect(owner.html).toContain(label);
    }
    expect(owner.html).toContain("DTF (direct-to-film)");
    expect(owner.html).toContain(notes);
    expect(customer.html + customer.text).not.toContain(notes);
  });

  it("rejects 6 files, unknown items, locations, sizes or print methods (nothing stored)", async () => {
    expect((await post(formOf({ firstName: "Pat", email: "pat@example.com" }, 6))).status).toBe(400);
    for (const bad of <Record<string, string>[]>[
      { items: JSON.stringify(["Spaceship"]) },
      { printLocations: JSON.stringify(["Forehead"]) },
      { sizes: JSON.stringify({ HUGE: 1 }) },
      { printMethod: "laser" },
    ]) {
      expect((await post(formOf({ firstName: "Pat", email: "pat@example.com", ...bad }))).status).toBe(400);
    }
    expect(await db.select().from(schema.uploads)).toHaveLength(0);
  });

  it("requires first name and email only", async () => {
    const res = await post(formOf({ firstName: "", email: "nope" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(Object.keys(json.fieldErrors).sort()).toEqual(["email", "firstName"]);
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
        headers: { "content-length": String(32 * 1024 * 1024) },
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
