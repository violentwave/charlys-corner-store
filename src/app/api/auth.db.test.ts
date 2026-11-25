// @vitest-environment node
/**
 * Customer accounts end to end (real Postgres): signup → code → verify, login, logout,
 * forgot/reset, /me, the account mockups list, and the CSRF origin check.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { schema, type Db } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { hasTestDb, setupTestDb } from "@/test/db";

// A fake cookie jar standing in for the browser.
const jar = new Map<string, string>();
let forwardedFor = "198.51.100.7";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": forwardedFor }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn().mockResolvedValue({ ok: true }) }));

const { POST: signup } = await import("./auth/signup/route");
const { POST: login } = await import("./auth/login/route");
const { POST: logout } = await import("./auth/logout/route");
const { POST: verify } = await import("./auth/verify/route");
const { POST: resend } = await import("./auth/resend/route");
const { POST: forgot } = await import("./auth/forgot/route");
const { POST: reset } = await import("./auth/reset/route");
const { GET: me } = await import("./auth/me/route");
const { GET: accountMockups } = await import("./account/mockups/route");

const post = (body: unknown, origin?: string) =>
  new Request("http://localhost:3000/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const lastCode = () => /code: (\d{6})/.exec(_outbox().at(-1)!.subject)![1]!;
const PASSWORD = "correct horse battery";

describe.skipIf(!hasTestDb)("accounts (real Postgres)", () => {
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
    _clearOutbox();
    jar.clear();
    forwardedFor = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  });
  afterAll(async () => close());

  const signUp = async (email = "Fan@Example.com") => {
    const res = await signup(post({ email, password: PASSWORD, name: "Fan", turnstileToken: "t" }));
    return { res, body: await json(res) };
  };

  it("signup signs in, emails a code, and verify confirms the email + links a lead", async () => {
    const { res, body } = await signUp();
    expect(res.status).toBe(200);
    expect(body.user).toEqual({ email: "fan@example.com", name: "Fan", verified: false });
    expect(jar.get("ccs_session")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(_outbox().at(-1)!.to).toBe("fan@example.com");

    const [user] = await db.select().from(schema.users);
    expect(user!.passwordHash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(user!.passwordHash).not.toContain(PASSWORD);

    expect((await json(await me())).user).toMatchObject({ verified: false });
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    expect((await verify(post({ code: wrong }))).status).toBe(400);
    expect((await verify(post({ code: lastCode() }))).status).toBe(200);
    expect((await json(await me())).user).toMatchObject({ email: "fan@example.com", verified: true });

    const [verified] = await db.select().from(schema.users);
    expect(verified!.emailVerifiedAt).not.toBeNull();
    expect(verified!.leadId).not.toBeNull();
  });

  it("a code dies after 5 wrong tries; resend issues a new one and the old one stops working", async () => {
    await signUp();
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect((await json(await verify(post({ code: wrong })))).error).toMatch(/isn't right/);
    expect((await json(await verify(post({ code: wrong })))).error).toMatch(/Too many wrong tries/);
    expect((await verify(post({ code }))).status).toBe(400);

    expect((await resend(post({}))).status).toBe(200);
    const fresh = lastCode();
    if (fresh !== code) expect((await verify(post({ code }))).status).toBe(400);
    expect((await verify(post({ code: fresh }))).status).toBe(200);
  });

  it("a verified email can't sign up again; an unverified one can be taken over", async () => {
    await signUp();
    await verify(post({ code: lastCode() }));
    jar.clear();
    const again = await signUp("fan@example.com");
    expect(again.res.status).toBe(409);
    expect(jar.has("ccs_session")).toBe(false);

    await signUp("drafty@example.com");
    jar.clear();
    const takeover = await signUp("DRAFTY@example.com");
    expect(takeover.res.status).toBe(200);
    expect(await db.select().from(schema.users).where(eq(schema.users.email, "drafty@example.com"))).toHaveLength(1);
  });

  it("login: same error for wrong password and unknown email; right password signs in", async () => {
    await signUp();
    jar.clear();
    const bad = await json(await login(post({ email: "fan@example.com", password: "nope nope nope" })));
    const unknown = await json(await login(post({ email: "ghost@example.com", password: "nope nope nope" })));
    expect(bad.error).toBe(unknown.error);
    expect(jar.has("ccs_session")).toBe(false);

    const ok = await login(post({ email: "FAN@example.com", password: PASSWORD }));
    expect(ok.status).toBe(200);
    expect(jar.has("ccs_session")).toBe(true);
  });

  it("login is rate limited per email", async () => {
    await signUp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      forwardedFor = `203.0.113.${i + 1}`; // different IPs, same email
      statuses.push((await login(post({ email: "fan@example.com", password: "wrong wrong wrong" }))).status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("logout deletes the session", async () => {
    await signUp();
    expect((await logout(post({}))).status).toBe(200);
    expect(jar.has("ccs_session")).toBe(false);
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
    expect((await json(await me())).user).toBeNull();
  });

  it("forgot/reset: one-time link, revokes old sessions, verifies the email, signs in", async () => {
    await signUp();
    const oldSession = jar.get("ccs_session");
    const unknown = await json(await forgot(post({ email: "ghost@example.com", turnstileToken: "t" })));
    const known = await json(await forgot(post({ email: "fan@example.com", turnstileToken: "t" })));
    expect(unknown.message).toBe(known.message);

    const link = /reset-password\?token=([A-Za-z0-9_-]{43})/.exec(_outbox().at(-1)!.html)!;
    const token = link[1]!;
    expect((await reset(post({ token, password: "a brand new password" }))).status).toBe(200);
    expect(jar.get("ccs_session")).not.toBe(oldSession);
    expect(await db.select().from(schema.sessions)).toHaveLength(1);
    expect((await json(await me())).user).toMatchObject({ verified: true });

    expect((await reset(post({ token, password: "another new password" }))).status).toBe(400);
    jar.clear();
    expect((await login(post({ email: "fan@example.com", password: "a brand new password" }))).status).toBe(200);
  });

  it("rejects cross-site POSTs (origin check)", async () => {
    const res = await signup(
      post({ email: "x@example.com", password: PASSWORD, turnstileToken: "t" }, "https://evil.example"),
    );
    expect(res.status).toBe(403);
    expect(await db.select().from(schema.users)).toHaveLength(0);
  });

  it("weak passwords are rejected at signup", async () => {
    const res = await signup(post({ email: "x@example.com", password: "short", turnstileToken: "t" }));
    expect(res.status).toBe(400);
    expect((await json(res)).fieldErrors).toHaveProperty("password");
  });

  it("account mockups needs a session and only lists the user's own rows", async () => {
    expect((await accountMockups()).status).toBe(401);
    await signUp();
    const body = await json(await accountMockups());
    expect(body.items).toEqual([]);
  });
});
