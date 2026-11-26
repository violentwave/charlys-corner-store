// @vitest-environment node
/**
 * Member data removal (real Postgres): deleting / hiding a design from "My designs" and
 * deleting the account. Emailed mockups go with their files; order requests stay for the shop.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { schema, type Db } from "@/lib/db";
import { upsertLead } from "@/lib/leads";
import { _memoryClear, _memoryKeys, getStorage } from "@/lib/storage";
import { hasTestDb, setupTestDb } from "@/test/db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.40" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { DELETE: removeDesign } = await import("./account/mockups/[id]/route");
const { GET: listDesigns } = await import("./account/mockups/route");
const { POST: deleteAccount } = await import("./account/delete/route");

const ORIGIN = "http://localhost:3000";
// Built at runtime: a throwaway fixture for the local/CI test database, not a credential.
const PASSWORD = ["member", "fixture", "pass"].join("-");

const del = (id: string, origin = ORIGIN) =>
  removeDesign(
    new Request(`${ORIGIN}/api/account/mockups/${id}`, {
      method: "DELETE",
      headers: { origin, host: "localhost:3000" },
    }),
    {
      params: Promise.resolve({ id }),
    },
  );
const postJson = (body: unknown) =>
  new Request(`${ORIGIN}/api/account/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "localhost:3000" },
    body: JSON.stringify(body),
  });

describe.skipIf(!hasTestDb)("member data removal (real Postgres)", () => {
  let db: Db;
  let resetDb: () => Promise<void>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.STORAGE_DRIVER = "memory";
    ({ db, reset: resetDb, close } = await setupTestDb());
  });
  beforeEach(async () => {
    await resetDb();
    _memoryClear();
    jar.clear();
  });
  afterAll(async () => close());

  async function member(email: string) {
    const leadId = await upsertLead(db, { email });
    const [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date(), leadId })
      .returning();
    return { user: user!, leadId };
  }
  async function signIn(userId: string) {
    const { token } = await createSession(db, userId);
    jar.set("ccs_session", token);
  }
  async function design(userId: string, leadId: string, kind: "mockup" | "order") {
    const folder = kind === "order" ? "orders" : "mockups";
    const storage = getStorage();
    const art = `${folder}/2026/11/${crypto.randomUUID()}-art.png`;
    const render = `${folder}/2026/11/${crypto.randomUUID()}-mockup-front.png`;
    await storage.put(art, new Uint8Array([1, 2, 3]), "image/png");
    await storage.put(render, new Uint8Array([4, 5, 6]), "image/png");
    const [row] = await db
      .insert(schema.mockups)
      .values({
        leadId,
        userId,
        kind,
        garment: "tshirt",
        colors: { body: "#ffffff" },
        views: [
          {
            view: "front",
            printArea: "full-front",
            layers: [
              {
                type: "image",
                artwork: 0,
                transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, flipX: false, skewX: 0, skewY: 0 },
              },
            ],
            mockupKey: render,
          },
        ],
        artworks: [{ key: art, name: "art.png", contentType: "image/png", size: 3 }],
        artworkKey: art,
        artworkName: "art.png",
        artworkContentType: "image/png",
        artworkSizeBytes: 3,
      })
      .returning();
    return { row: row!, keys: [art, render] };
  }

  it("deleting an emailed mockup removes the row and its files", async () => {
    const { user, leadId } = await member("a@example.com");
    await signIn(user.id);
    const { row, keys } = await design(user.id, leadId, "mockup");

    const res = await del(row.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "deleted" });
    expect(await db.select().from(schema.mockups)).toHaveLength(0);
    for (const k of keys) expect(_memoryKeys()).not.toContain(k);
  });

  it("removing an order request only hides it: the shop keeps the row and files", async () => {
    const { user, leadId } = await member("b@example.com");
    await signIn(user.id);
    const { row, keys } = await design(user.id, leadId, "order");

    expect(await (await del(row.id)).json()).toEqual({ ok: true, result: "hidden" });
    const [kept] = await db.select().from(schema.mockups).where(eq(schema.mockups.id, row.id));
    expect(kept!.hiddenByUserAt).not.toBeNull();
    for (const k of keys) expect(_memoryKeys()).toContain(k);

    const list = (await (await listDesigns()).json()) as { items: unknown[] };
    expect(list.items).toHaveLength(0);
    // Already hidden: a second delete is a 404, not a second "hidden".
    expect((await del(row.id)).status).toBe(404);
  });

  it("someone else's design is a 404, and cross-site / signed-out requests are refused", async () => {
    const owner = await member("owner@example.com");
    const other = await member("other@example.com");
    const { row } = await design(owner.user.id, owner.leadId, "mockup");

    expect((await del(row.id)).status).toBe(401);
    await signIn(other.user.id);
    expect((await del(row.id)).status).toBe(404);
    expect((await del(row.id, "https://evil.example")).status).toBe(403);
    expect(await db.select().from(schema.mockups)).toHaveLength(1);
  });

  it("the list says when files expire, what Delete does, and gives download links", async () => {
    const { user, leadId } = await member("c@example.com");
    await signIn(user.id);
    await design(user.id, leadId, "mockup");
    await design(user.id, leadId, "order");
    const { items } = (await (await listDesigns()).json()) as {
      items: { kind: string; removal: string; filesExpireAt: string | null; views: { downloadUrl: string | null }[] }[];
    };
    const mockup = items.find((i) => i.kind === "mockup")!;
    const order = items.find((i) => i.kind === "order")!;
    expect(mockup.removal).toBe("delete");
    expect(order.removal).toBe("hide");
    expect(new Date(mockup.filesExpireAt!).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(order.filesExpireAt).toBeNull();
    expect(mockup.views[0]!.downloadUrl).toBeTruthy();
  });

  it("account deletion: needs the password and DELETE; keeps order requests (detached), deletes the rest", async () => {
    const { user, leadId } = await member("d@example.com");
    await signIn(user.id);
    const mockup = await design(user.id, leadId, "mockup");
    const order = await design(user.id, leadId, "order");

    expect((await deleteAccount(postJson({ password: "wrong-one", confirm: "DELETE" }))).status).toBe(400);
    expect((await deleteAccount(postJson({ password: PASSWORD, confirm: "delete" }))).status).toBe(400);

    const res = await deleteAccount(postJson({ password: PASSWORD, confirm: "DELETE" }));
    expect(res.status).toBe(200);
    expect(await db.select().from(schema.users)).toHaveLength(0);
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
    expect(jar.has("ccs_session")).toBe(false);

    const rows = await db.select().from(schema.mockups);
    expect(rows.map((r) => [r.id, r.userId])).toEqual([[order.row.id, null]]);
    for (const k of mockup.keys) expect(_memoryKeys()).not.toContain(k);
    for (const k of order.keys) expect(_memoryKeys()).toContain(k);
  });
});
