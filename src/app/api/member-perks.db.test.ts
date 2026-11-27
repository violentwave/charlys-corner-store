// @vitest-environment node
/**
 * Member perks (real Postgres): coupon wallet, order tracking (owner one-click links),
 * account settings + password change, re-send a mockup, order again, drafts, brand kit,
 * saved sizes / rosters, and what account deletion takes with it.
 */
import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { issueCoupon } from "@/lib/coupon-store";
import { schema, type Db } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { upsertLead } from "@/lib/leads";
import { ownerStageUrl } from "@/lib/order-stage";
import { _memoryClear, _memoryKeys, getStorage } from "@/lib/storage";
import { hasTestDb, setupTestDb } from "@/test/db";

const jar = new Map<string, string>();
let forwardedFor = "198.51.100.80";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": forwardedFor }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { GET: wallet } = await import("./account/wallet/route");
const { GET: listDesigns } = await import("./account/mockups/route");
const { GET: stageGet, POST: stagePost } = await import("./owner/orders/[id]/stage/route");
const { GET: getSettings, PATCH: patchSettings } = await import("./account/settings/route");
const { POST: changePassword } = await import("./account/password/route");
const { POST: resend } = await import("./account/mockups/[id]/resend/route");
const { POST: reorder } = await import("./account/orders/[id]/reorder/route");
const drafts = await import("./account/drafts/route");
const draft = await import("./account/drafts/[id]/route");
const brandKit = await import("./account/brand-kit/route");
const sizeSets = await import("./account/size-sets/route");
const sizeSet = await import("./account/size-sets/[id]/route");
const { POST: deleteAccount } = await import("./account/delete/route");

const ORIGIN = "http://localhost:3000";
// Built at runtime: throwaway fixtures for the local/CI test database, not credentials.
const PASSWORD = ["perks", "fixture", "pass"].join("-");
const NEW_PASSWORD = ["perks", "fixture", "next"].join("-");
const png = readFileSync("tests/fixtures/tiny.png");
const headersJson = { "content-type": "application/json", origin: ORIGIN, host: "localhost:3000" };
const jsonReq = (method: string, body: unknown) =>
  new Request(`${ORIGIN}/api/x`, { method, headers: headersJson, body: JSON.stringify(body) });
const bare = (method = "POST") =>
  new Request(`${ORIGIN}/api/x`, { method, headers: { origin: ORIGIN, host: "localhost:3000" } });
const multipart = (method: string, payload: unknown, files: Record<string, Uint8Array> = {}) => {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  for (const [k, bytes] of Object.entries(files))
    form.append(k, new Blob([new Uint8Array(bytes)], { type: "image/png" }), `${k}.png`);
  return new Request(`${ORIGIN}/api/x`, { method, headers: { origin: ORIGIN, host: "localhost:3000" }, body: form });
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (res: Response) => (await res.json()) as Record<string, unknown>;
const layer = {
  type: "image",
  artwork: 0,
  transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0, flipX: false },
};

describe.skipIf(!hasTestDb)("member perks (real Postgres)", () => {
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

  async function member(email = "fan@example.com") {
    const leadId = await upsertLead(db, { email, name: "Fan" });
    const [user] = await db
      .insert(schema.users)
      .values({ email, name: "Fan", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date(), leadId })
      .returning();
    jar.set("ccs_session", (await createSession(db, user!.id)).token);
    return { user: user!, leadId };
  }
  async function design(userId: string, leadId: string, kind: "mockup" | "order", createdAt = new Date()) {
    const coupon = await issueCoupon(db, leadId);
    const folder = kind === "order" ? "orders" : "mockups";
    const storage = getStorage();
    const art = `${folder}/2026/11/${crypto.randomUUID()}-art.png`;
    const render = `${folder}/2026/11/${crypto.randomUUID()}-mockup-front.png`;
    await storage.put(art, png, "image/png");
    await storage.put(render, png, "image/png");
    const id = crypto.randomUUID();
    if (kind === "order") await db.insert(schema.orders).values({ id, leadId, userId, createdAt });
    const [row] = await db
      .insert(schema.mockups)
      .values({
        id,
        orderId: kind === "order" ? id : null,
        leadId,
        userId,
        couponId: coupon.id,
        kind,
        createdAt,
        garment: "tshirt",
        colors: { body: "#ffffff" },
        sizes: kind === "order" ? { M: 2 } : {},
        views: [{ view: "front", printArea: "full-front", layers: [layer], mockupKey: render } as never],
        artworks: [{ key: art, name: "art.png", contentType: "image/png", size: png.byteLength }],
        artworkKey: art,
        artworkName: "art.png",
        artworkContentType: "image/png",
        artworkSizeBytes: png.byteLength,
      })
      .returning();
    return { row: row!, keys: [art, render] };
  }

  it("wallet shows the member's coupon", async () => {
    const { leadId } = await member();
    expect((await body(await wallet())).coupon).toBeNull();
    await issueCoupon(db, leadId);
    const coupon = (await body(await wallet())).coupon as { code: string; status: string; percentOff: number };
    expect(coupon.code).toMatch(/^CHARLY-/);
    expect(coupon).toMatchObject({ status: "issued", percentOff: 15 });
  });

  it("order tracking: the owner's signed link confirms, then updates the stage and emails the customer", async () => {
    const { user, leadId } = await member();
    const { row } = await design(user.id, leadId, "order");
    const link = new URL(ownerStageUrl(row.id, "ready"));
    const get = await stageGet(new Request(link), params(row.id));
    expect(get.status).toBe(200);
    expect(await get.text()).toContain("Mark this order as “Ready”?");
    const [unchanged] = await db.select().from(schema.orders).where(eq(schema.orders.id, row.id));
    expect(unchanged!.stage).toBe("received"); // GET never changes anything

    const form = new URLSearchParams(link.search);
    const post = await stagePost(
      new Request(link, {
        method: "POST",
        body: form,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      params(row.id),
    );
    expect(post.status).toBe(200);
    const [updated] = await db.select().from(schema.orders).where(eq(schema.orders.id, row.id));
    expect(updated!.stage).toBe("ready");
    expect(_outbox().at(-1)).toMatchObject({ to: "fan@example.com" });
    expect(_outbox().at(-1)!.subject).toContain("Ready");

    const items = (await body(await listDesigns())).items as { orderStage: { label: string } }[];
    expect(items[0]!.orderStage.label).toBe("Ready");

    // Tampered or foreign links do nothing.
    form.set("to", "completed");
    const forged = await stagePost(
      new Request(link, {
        method: "POST",
        body: form,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      params(row.id),
    );
    expect(forged.status).toBe(400);
    const mockup = await design(user.id, leadId, "mockup");
    const onMockup = await stageGet(new Request(ownerStageUrl(mockup.row.id, "ready")), params(mockup.row.id));
    expect(onMockup.status).toBe(400);
  });

  it("settings: name and marketing emails", async () => {
    await member();
    expect((await body(await getSettings())).settings).toEqual({
      email: "fan@example.com",
      name: "Fan",
      marketingOptIn: false,
    });
    const res = await body(await patchSettings(jsonReq("PATCH", { name: "Charly Fan", marketingOptIn: true })));
    expect(res.settings).toEqual({ email: "fan@example.com", name: "Charly Fan", marketingOptIn: true });
    const [lead] = await db.select().from(schema.leads);
    expect(lead!.marketingOptIn).toBe(true);
  });

  it("changing the password needs the current one and signs out everywhere", async () => {
    const { user } = await member();
    await createSession(db, user.id); // another device
    expect((await changePassword(jsonReq("POST", { newPassword: NEW_PASSWORD }))).status).toBe(400);
    const res = await changePassword(jsonReq("POST", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }));
    expect(await body(res)).toEqual({ ok: true, signedOut: true });
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
    expect(jar.has("ccs_session")).toBe(false);
  });

  it("re-sending a mockup emails it with the PNGs; not for orders or expired files", async () => {
    const { user, leadId } = await member();
    const { row } = await design(user.id, leadId, "mockup");
    expect((await resend(bare(), params(row.id))).status).toBe(200);
    const sent = _outbox().at(-1)!;
    expect(sent.to).toBe("fan@example.com");
    expect(sent.attachments).toHaveLength(1);

    const order = await design(user.id, leadId, "order");
    expect((await resend(bare(), params(order.row.id))).status).toBe(400);
    const old = await design(user.id, leadId, "mockup", new Date(Date.now() - 31 * 24 * 60 * 60 * 1000));
    expect((await resend(bare(), params(old.row.id))).status).toBe(410);
  });

  it("order again: same design and files, new sizes, linked to the original", async () => {
    const { user, leadId } = await member();
    const { row, keys } = await design(user.id, leadId, "order");
    expect((await reorder(jsonReq("POST", { sizes: { Z: 1 } }), params(row.id))).status).toBe(400);
    expect((await reorder(jsonReq("POST", { sizes: { M: 0 } }), params(row.id))).status).toBe(400);
    const res = await body(await reorder(jsonReq("POST", { sizes: { L: 3, M: 0 } }), params(row.id)));
    const [copy] = await db
      .select()
      .from(schema.mockups)
      .where(eq(schema.mockups.id, String(res.mockupId)));
    expect(copy).toMatchObject({ kind: "order", orderId: copy!.id, reorderOf: row.id, sizes: { L: 3 } });
    const [copyOrder] = await db.select().from(schema.orders).where(eq(schema.orders.id, copy!.id));
    expect(copyOrder).toMatchObject({ stage: "received", reorderOf: row.id, quoteCents: null });
    expect(copy!.artworks[0]!.key).toBe(keys[0]);
    expect(_outbox().some((m) => m.subject.includes("ORDER REQUEST (again)"))).toBe(true);
  });

  it("drafts: save with an image, open, replace (old image deleted), delete", async () => {
    await member();
    const designPayload = {
      garment: "tshirt",
      colors: { body: "#ffffff" },
      views: [{ view: "front", printArea: "full-front", layers: [layer] }],
    };
    const created = await body(
      await drafts.POST(multipart("POST", { name: "Team tee", design: designPayload }, { "artwork-0": png })),
    );
    expect(created.ok).toBe(true);
    const firstKeys = _memoryKeys().filter((k) => k.startsWith("mockups/drafts/"));
    expect(firstKeys).toHaveLength(1);

    const list = (await body(await drafts.GET())).drafts as { id: string; imageCount: number; filesExpireAt: string }[];
    expect(list).toHaveLength(1);
    expect(list[0]!.imageCount).toBe(1);
    const opened = await body(await draft.GET(bare("GET"), params(list[0]!.id)));
    expect((opened.artworks as { url: string }[])[0]!.url).toMatch(/^data:image\/png/);

    await drafts.POST(
      multipart("POST", { id: list[0]!.id, name: "Team tee v2", design: designPayload }, { "artwork-0": png }),
    );
    const keysNow = _memoryKeys().filter((k) => k.startsWith("mockups/drafts/"));
    expect(keysNow).toHaveLength(1);
    expect(keysNow[0]).not.toBe(firstKeys[0]);

    // Missing image for an image layer: refused.
    expect((await drafts.POST(multipart("POST", { name: "No file", design: designPayload }))).status).toBe(400);

    expect((await draft.DELETE(bare("DELETE"), params(list[0]!.id))).status).toBe(200);
    expect(_memoryKeys().filter((k) => k.startsWith("mockups/drafts/"))).toHaveLength(0);
  });

  it("brand kit: colors, fonts and a logo; replacing the logo deletes the old file", async () => {
    await member();
    const saved = await body(
      await brandKit.PUT(multipart("PUT", { inkColors: ["#ff2e97", "#000000"], fonts: ["anton"] }, { "logo-0": png })),
    );
    const kit = saved.brandKit as { inkColors: string[]; fonts: string[]; logo: { url: string } };
    expect(kit.inkColors).toEqual(["#ff2e97", "#000000"]);
    expect(kit.logo.url).toMatch(/^data:image\/png/);
    const first = _memoryKeys().filter((k) => k.startsWith("brand/"));

    await brandKit.PUT(multipart("PUT", { inkColors: [], fonts: [] }, { "logo-0": png }));
    const second = _memoryKeys().filter((k) => k.startsWith("brand/"));
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);

    const removed = await body(await brandKit.PUT(multipart("PUT", { inkColors: [], fonts: [], removeLogo: true })));
    expect((removed.brandKit as { logo: unknown }).logo).toBeNull();
    expect(_memoryKeys().filter((k) => k.startsWith("brand/"))).toHaveLength(0);
    expect((await brandKit.PUT(multipart("PUT", { fonts: ["comic-sans"] }))).status).toBe(400);
  });

  it("saved sizes / rosters: create, edit, delete; only your own", async () => {
    await member();
    const made = await body(
      await sizeSets.POST(
        jsonReq("POST", {
          name: "Softball team",
          sizes: { M: 6, L: 4 },
          roster: [{ name: "Ana", size: "M", number: "7" }],
        }),
      ),
    );
    const id = (made.sizeSet as { id: string }).id;
    const edited = await body(
      await sizeSet.PUT(jsonReq("PUT", { name: "Softball 2027", sizes: { M: 7 } }), params(id)),
    );
    expect(edited.sizeSet).toMatchObject({ name: "Softball 2027", sizes: { M: 7 }, roster: [] });

    jar.clear();
    await member("other@example.com");
    expect((await sizeSet.DELETE(bare("DELETE"), params(id))).status).toBe(404);
    expect(((await body(await sizeSets.GET())).sizeSets as unknown[]).length).toBe(0);
  });

  it("deleting the account removes drafts and the brand-kit logo too", async () => {
    await member();
    const designPayload = {
      garment: "tshirt",
      colors: { body: "#ffffff" },
      views: [{ view: "front", printArea: "full-front", layers: [layer] }],
    };
    await drafts.POST(multipart("POST", { name: "D", design: designPayload }, { "artwork-0": png }));
    await brandKit.PUT(multipart("PUT", { inkColors: [], fonts: [] }, { "logo-0": png }));
    expect(_memoryKeys()).toHaveLength(2);
    expect((await deleteAccount(jsonReq("POST", { password: PASSWORD, confirm: "DELETE" }))).status).toBe(200);
    expect(_memoryKeys()).toHaveLength(0);
    expect(await db.select().from(schema.drafts)).toHaveLength(0);
  });
});
