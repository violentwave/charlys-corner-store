// @vitest-environment node
/**
 * Cart (real Postgres, memory storage): add from the builder, edit sizes/notes, remove, send
 * as ONE order (files move to orders/, spreadsheet owner email + order.csv), and the order is
 * then priced, listed and paid as one.
 */
import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { MAX_CART_ITEMS } from "@/lib/cart";
import { schema, type Db } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { upsertLead } from "@/lib/leads";
import { ownerQuoteUrl } from "@/lib/order-stage";
import { loadQuotedOrder, priceOrder } from "@/lib/payments";
import { _memoryClear, _memoryKeys } from "@/lib/storage";
import { hasTestDb, setupTestDb } from "@/test/db";

const jar = new Map<string, string>();
let forwardedFor = "198.51.100.90";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": forwardedFor }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const cart = await import("./cart/route");
const cartItem = await import("./cart/[id]/route");
const { POST: submit } = await import("./cart/submit/route");
const { GET: listDesigns } = await import("./account/mockups/route");
const { POST: quotePost } = await import("./owner/orders/[id]/quote/route");

const ORIGIN = "http://localhost:3000";
// Built at runtime: throwaway fixture for the local/CI test database, not a credential.
const PASSWORD = ["cart", "fixture", "pass"].join("-");
const png = readFileSync("tests/fixtures/tiny.png");
const blob = (b: Uint8Array) =>
  new Blob([b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer], { type: "image/png" });
const sameOrigin = { origin: ORIGIN, host: "localhost:3000" };
const jsonReq = (method: string, body: unknown) =>
  new Request(`${ORIGIN}/api/x`, {
    method,
    headers: { ...sameOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (res: Response) => (await res.json()) as Record<string, unknown>;

type Design = { garment: string; colors: Record<string, string>; sizes?: Record<string, number>; notes?: string };
const tee: Design = { garment: "tshirt", colors: { body: "#263147" }, sizes: { M: 2 } };
const hoodie: Design = { garment: "hoodie", colors: { body: "#ffffff" } };

function addRequest(design: Design) {
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      marketingOptIn: false,
      intent: "email",
      views: [
        {
          view: "front",
          printArea: "full-front",
          transform: { x: 344, y: 292, width: 312, height: 364, rotation: 0, flipX: false },
        },
      ],
      sizes: {},
      ...design,
    }),
  );
  form.append("artwork", blob(png), "art.png");
  form.append("mockup-front", blob(png), "mockup-front.png");
  return new Request(`${ORIGIN}/api/cart`, { method: "POST", headers: sameOrigin, body: form });
}

type Item = {
  id: string;
  garmentName: string;
  pieces: number;
  sizes: Record<string, number>;
  views: { imageUrl: string | null }[];
};

describe.skipIf(!hasTestDb)("cart (real Postgres)", () => {
  let db: Db;
  let resetDb: () => Promise<void>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.EMAIL_DRIVER = "console";
    process.env.STORAGE_DRIVER = "memory";
    ({ db, reset: resetDb, close } = await setupTestDb());
  });
  beforeEach(async () => {
    await resetDb();
    _memoryClear();
    _clearOutbox();
    jar.clear();
    forwardedFor = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  });
  afterAll(async () => close());

  async function member(email = "cart@example.com") {
    const leadId = await upsertLead(db, { email, name: "Cart Fan" });
    const [user] = await db
      .insert(schema.users)
      .values({
        email,
        name: "Cart Fan",
        passwordHash: await hashPassword(PASSWORD),
        emailVerifiedAt: new Date(),
        leadId,
      })
      .returning();
    jar.set("ccs_session", (await createSession(db, user!.id)).token);
    return user!;
  }
  const add = async (design: Design) => {
    const res = await cart.POST(addRequest(design));
    expect(res.status).toBe(200);
    return (await body(res)).item as Item;
  };
  const list = async () => (await body(await cart.GET())) as { items: Item[]; pieces: number; max: number };

  it("add → list → reopen in the builder; files stay under mockups/cart/", async () => {
    await member();
    const first = await add({ ...tee, notes: "Front only please" });
    await add(hoodie);
    expect(first.garmentName).toBeTruthy();
    expect(first.pieces).toBe(2);

    const listed = await list();
    expect(listed.items.map((i) => i.id)[0]).toBe(first.id); // oldest first
    expect(listed.items).toHaveLength(2);
    expect(listed.pieces).toBe(2);
    expect(listed.max).toBe(MAX_CART_ITEMS);
    expect(listed.items[0]!.views[0]!.imageUrl).toBeTruthy();
    expect(_memoryKeys().length).toBe(4);
    expect(_memoryKeys().every((k) => k.startsWith("mockups/cart/"))).toBe(true);
    expect(_outbox()).toHaveLength(0); // adding to the cart sends nothing

    const restore = await body(await cartItem.GET(new Request(`${ORIGIN}/api/x`), params(first.id)));
    expect(restore).toMatchObject({ ok: true, design: { garment: "tshirt", sizes: { M: 2 } }, filesExpired: false });
    expect((restore.artworks as unknown[]).length).toBe(1);
  });

  it("only the owner can see, edit or remove an item; guests can't add", async () => {
    expect((await cart.POST(addRequest(tee))).status).toBe(401);
    await member("a@example.com");
    const mine = await add(tee);
    await member("b@example.com");
    expect((await list()).items).toHaveLength(0);
    expect((await cartItem.GET(new Request(`${ORIGIN}/api/x`), params(mine.id))).status).toBe(404);
    expect((await cartItem.PATCH(jsonReq("PATCH", { notes: "x" }), params(mine.id))).status).toBe(404);
    expect(
      (
        await cartItem.DELETE(
          new Request(`${ORIGIN}/api/x`, { method: "DELETE", headers: sameOrigin }),
          params(mine.id),
        )
      ).status,
    ).toBe(404);
    expect((await db.select().from(schema.cartItems)).length).toBe(1);
  });

  it("edit sizes and notes; unknown sizes refused; remove deletes the files", async () => {
    await member();
    const item = await add(hoodie);
    expect((await cartItem.PATCH(jsonReq("PATCH", { sizes: { ZZ: 1 } }), params(item.id))).status).toBe(400);
    expect((await cartItem.PATCH(jsonReq("PATCH", {}), params(item.id))).status).toBe(400);
    const res = await cartItem.PATCH(jsonReq("PATCH", { sizes: { L: 3, M: 0 }, notes: "Rush" }), params(item.id));
    expect(res.status).toBe(200);
    expect((await body(res)).item).toMatchObject({ sizes: { L: 3 }, pieces: 3, notes: "Rush" });

    const del = await cartItem.DELETE(
      new Request(`${ORIGIN}/api/x`, { method: "DELETE", headers: sameOrigin }),
      params(item.id),
    );
    expect(del.status).toBe(200);
    expect((await list()).items).toHaveLength(0);
    expect(_memoryKeys()).toHaveLength(0);
  });

  it(`holds up to ${MAX_CART_ITEMS} designs`, async () => {
    const user = await member();
    await db.insert(schema.cartItems).values(
      Array.from({ length: MAX_CART_ITEMS }, () => ({
        userId: user.id,
        garment: "tshirt",
        colors: { body: "#263147" },
        views: [],
      })),
    );
    const res = await cart.POST(addRequest(tee));
    expect(res.status).toBe(409);
    expect(_memoryKeys()).toHaveLength(0); // refused before storing anything
  });

  it("send: every item needs sizes; then one order, files moved, spreadsheet email + CSV", async () => {
    const user = await member();
    expect((await submit(jsonReq("POST", {}))).status).toBe(400); // empty cart
    const a = await add({ ...tee, notes: "=cmd|' /C calc'!A0" });
    const b = await add(hoodie);

    const missing = await submit(jsonReq("POST", {}));
    expect(missing.status).toBe(400);
    expect((await body(missing)).fieldErrors).toEqual({ [b.id]: "Add at least one size" });

    await cartItem.PATCH(jsonReq("PATCH", { sizes: { XL: 4 } }), params(b.id));
    const sent = await submit(jsonReq("POST", { notes: "Need by Friday" }));
    expect(sent.status).toBe(200);
    const { orderId, itemCount } = (await body(sent)) as { orderId: string; itemCount: number };
    expect(itemCount).toBe(2);

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order).toMatchObject({ userId: user.id, stage: "received", notes: "Need by Friday", quoteCents: null });
    const items = await db.select().from(schema.mockups).where(eq(schema.mockups.orderId, orderId));
    expect(items).toHaveLength(2);
    expect(items.every((m) => m.kind === "order" && m.id !== orderId)).toBe(true);
    expect(items.find((m) => m.garment === "hoodie")!.sizes).toEqual({ XL: 4 });

    // Files: copied to orders/, the cart's copies gone, cart empty.
    expect(_memoryKeys().length).toBe(4);
    expect(_memoryKeys().every((k) => k.startsWith("orders/"))).toBe(true);
    for (const m of items) {
      expect(m.artworks[0]!.key.startsWith("orders/")).toBe(true);
      expect(m.views[0]!.mockupKey.startsWith("orders/")).toBe(true);
    }
    expect((await list()).items).toHaveLength(0);

    // Owner: one spreadsheet email with order.csv; customer: one confirmation.
    const owner = _outbox().find((m) => m.subject.startsWith("ORDER REQUEST: 2 designs, 6 pcs"))!;
    expect(owner).toBeTruthy();
    expect(owner.html).toContain("<table");
    expect(owner.html).toContain(ownerQuoteUrl(orderId).split("?")[0]);
    const csv = new TextDecoder().decode(owner.attachments![0]!.content);
    expect(owner.attachments![0]!.filename).toBe(`order-${orderId.slice(0, 8)}.csv`);
    expect(csv.trimEnd().split("\r\n")).toHaveLength(3);
    expect(csv).toContain("'=cmd"); // formula neutralised
    const customer = _outbox().find((m) => m.to === "cart@example.com")!;
    expect(customer.subject).toContain("We got your order request");
    expect(customer.html).not.toContain("cmd|"); // free text never echoed to the customer
    void a;

    // My designs: both designs, one order of 2.
    const designs = (await body(await listDesigns())).items as { order: { id: string; itemCount: number } }[];
    expect(designs).toHaveLength(2);
    expect(designs.every((d) => d.order.id === orderId && d.order.itemCount === 2)).toBe(true);
  });

  it("a one-design cart order shares its id with the design; the owner prices the whole order", async () => {
    await member();
    const item = await add(tee);
    const sent = (await body(await submit(jsonReq("POST", {})))) as { orderId: string };
    const [design] = await db.select().from(schema.mockups).where(eq(schema.mockups.orderId, sent.orderId));
    expect(design!.id).toBe(sent.orderId);
    void item;

    const link = new URL(ownerQuoteUrl(sent.orderId));
    const form = new URLSearchParams({ exp: link.searchParams.get("exp")!, sig: link.searchParams.get("sig")! });
    form.set("price", "64.00");
    const res = await quotePost(
      new Request(link, {
        method: "POST",
        body: form,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      params(sent.orderId),
    );
    expect(res.status).toBe(200);
    const row = await loadQuotedOrder(db, sent.orderId);
    expect(row!.items).toHaveLength(1);
    expect((await priceOrder(db, row!)).totalCents).toBe(6400);
  });

  it("two sends at once make one order", async () => {
    await member();
    await add(tee);
    await add({ ...tee, colors: { body: "#ffffff" } });
    const [r1, r2] = await Promise.all([submit(jsonReq("POST", {})), submit(jsonReq("POST", {}))]);
    // The loser either finds the cart already empty (400) or loses inside the transaction (409).
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);
    expect(await db.select().from(schema.orders)).toHaveLength(1);
    expect(await db.select().from(schema.mockups)).toHaveLength(2);
    expect(_memoryKeys().every((k) => k.startsWith("orders/"))).toBe(true);
    expect(_memoryKeys()).toHaveLength(4); // the loser's copies were cleaned up
  });
});
