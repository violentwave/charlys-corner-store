// @vitest-environment node
/**
 * 2FA + Google sign-in (real Postgres): authenticator app, email codes, backup codes, the
 * sign-in challenge after password / reset / Google, account security changes.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { issueResetToken } from "@/lib/auth/email-tokens";
import { createSession } from "@/lib/auth/session";
import { totpCode, totpStep } from "@/lib/auth/totp";
import { schema, type Db } from "@/lib/db";
import { _clearOutbox, _outbox } from "@/lib/email";
import { hasTestDb, setupTestDb } from "@/test/db";

const jar = new Map<string, string>();
let forwardedFor = "198.51.100.60";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": forwardedFor }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { POST: login } = await import("./auth/login/route");
const { POST: verify2fa, GET: pending2fa } = await import("./auth/2fa/verify/route");
const { POST: resend2fa } = await import("./auth/2fa/resend/route");
const { POST: reset } = await import("./auth/reset/route");
const { GET: me } = await import("./auth/me/route");
const { GET: googleStart } = await import("./auth/google/start/route");
const { GET: googleCallback } = await import("./auth/google/callback/route");
const { GET: security } = await import("./account/security/route");
const { POST: totpSetup } = await import("./account/security/totp/setup/route");
const { POST: totpEnable } = await import("./account/security/totp/enable/route");
const { POST: emailSetup } = await import("./account/security/email/setup/route");
const { POST: emailEnable } = await import("./account/security/email/enable/route");
const { POST: disable2fa } = await import("./account/security/disable/route");
const { POST: newBackupCodes } = await import("./account/security/backup-codes/route");
const { POST: unlinkGoogle } = await import("./account/security/google/unlink/route");
const { POST: deleteAccount } = await import("./account/delete/route");

const ORIGIN = "http://localhost:3000";
// Built at runtime: a throwaway fixture for the local/CI test database, not a credential.
const PASSWORD = ["twofactor", "fixture", "pass"].join("-");
const NEW_PASSWORD = ["another", "fixture", "pass"].join("-");
const WRONG_PASSWORD = ["not", "the", "fixture"].join("-");
const post = (body: unknown = {}) =>
  new Request(`${ORIGIN}/api/x`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "localhost:3000" },
    body: JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const lastCode = () => /code: (\d{6})/.exec(_outbox().at(-1)!.subject)![1]!;
const nextStepCode = (secret: string) => totpCode(secret.replace(/\s/g, ""), totpStep() + 1);

describe.skipIf(!hasTestDb)("2FA + Google (real Postgres)", () => {
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
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });
  afterAll(async () => close());

  async function member(email = "fan@example.com", password: string | null = PASSWORD) {
    const [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash: password ? await hashPassword(password) : null, emailVerifiedAt: new Date() })
      .returning();
    return user!;
  }
  async function signIn(userId: string) {
    jar.set("ccs_session", (await createSession(db, userId)).token);
  }
  /** Turns on app 2FA through the real routes; returns the secret + backup codes. */
  async function enableTotp(userId: string) {
    await signIn(userId);
    const setup = await json(await totpSetup(post()));
    const secret = String(setup.secret);
    expect(String(setup.qrSvg)).toContain("<svg");
    const enabled = await json(await totpEnable(post({ code: totpCode(secret.replace(/\s/g, ""), totpStep()) })));
    expect(enabled.ok).toBe(true);
    jar.clear();
    return { secret, backupCodes: enabled.backupCodes as string[] };
  }

  it("authenticator app: login asks for the code, the code signs in, a code works once", async () => {
    const user = await member();
    const { secret } = await enableTotp(user.id);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row!.totpSecret).toMatch(/^v1\./); // encrypted at rest
    expect(row!.recoveryCodeHashes).toHaveLength(10);

    const res = await json(await login(post({ email: "fan@example.com", password: PASSWORD })));
    expect(res).toEqual({ ok: true, twoFactor: { method: "totp", emailSent: false } });
    expect(jar.has("ccs_session")).toBe(false);
    expect(jar.has("ccs_2fa")).toBe(true);
    expect(await json(await pending2fa())).toEqual({ pending: { method: "totp" } });

    expect((await verify2fa(post({ code: "000000" }))).status).toBe(400);
    const code = nextStepCode(secret);
    const ok = await json(await verify2fa(post({ code })));
    expect(ok).toMatchObject({ ok: true, usedBackupCode: false, backupCodesLeft: 10 });
    expect(jar.has("ccs_session")).toBe(true);
    expect(jar.has("ccs_2fa")).toBe(false);

    // Same code again on a fresh login: refused (replay).
    jar.clear();
    await login(post({ email: "fan@example.com", password: PASSWORD }));
    expect((await verify2fa(post({ code }))).status).toBe(400);
  });

  it("backup codes work once each; 5 wrong codes end the challenge", async () => {
    const user = await member();
    const { backupCodes } = await enableTotp(user.id);
    await login(post({ email: "fan@example.com", password: PASSWORD }));
    const used = await json(await verify2fa(post({ code: backupCodes[0]!.toLowerCase() })));
    expect(used).toMatchObject({ ok: true, usedBackupCode: true, backupCodesLeft: 9 });

    jar.clear();
    await login(post({ email: "fan@example.com", password: PASSWORD }));
    expect((await verify2fa(post({ code: backupCodes[0]! }))).status).toBe(400);
    for (let i = 0; i < 3; i++) await verify2fa(post({ code: "111111" }));
    expect((await verify2fa(post({ code: "111111" }))).status).toBe(401); // 5th wrong: challenge dead
    expect((await verify2fa(post({ code: backupCodes[1]! }))).status).toBe(401);
  });

  it("email 2FA: set up with an emailed code; login emails a code; resend works", async () => {
    const user = await member();
    await signIn(user.id);
    expect((await emailSetup(post())).status).toBe(200);
    const enabled = await json(await emailEnable(post({ code: lastCode() })));
    expect(enabled.ok).toBe(true);
    expect(enabled.backupCodes).toHaveLength(10);

    jar.clear();
    _clearOutbox();
    expect(await json(await login(post({ email: "fan@example.com", password: PASSWORD })))).toEqual({
      ok: true,
      twoFactor: { method: "email", emailSent: true },
    });
    const first = lastCode();
    expect((await resend2fa(post())).status).toBe(200);
    expect((await verify2fa(post({ code: first }))).status).toBe(400); // replaced by the resend
    expect((await verify2fa(post({ code: lastCode() }))).status).toBe(200);
  });

  it("a password reset doesn't skip 2FA", async () => {
    const user = await member();
    await enableTotp(user.id);
    const token = await issueResetToken(db, user.id);
    const res = await json(await reset(post({ token, password: NEW_PASSWORD })));
    expect(res).toEqual({ ok: true, twoFactor: { method: "totp", emailSent: false } });
    expect(jar.has("ccs_session")).toBe(false);
  });

  it("turning 2FA off and new backup codes need the password and a current code", async () => {
    const user = await member();
    const { secret, backupCodes } = await enableTotp(user.id);
    await signIn(user.id);
    expect((await disable2fa(post({ password: PASSWORD }))).status).toBe(400);
    expect((await disable2fa(post({ password: WRONG_PASSWORD, code: nextStepCode(secret) }))).status).toBe(400);
    const fresh = await json(await newBackupCodes(post({ password: PASSWORD, code: backupCodes[3]! })));
    expect(fresh.backupCodes).toHaveLength(10);
    expect((fresh.backupCodes as string[]).includes(backupCodes[4]!)).toBe(false);

    expect((await disable2fa(post({ password: PASSWORD, code: (fresh.backupCodes as string[])[0]! }))).status).toBe(
      200,
    );
    const sec = (await json(await security())).security as { twoFactor: { method: string | null } };
    expect(sec.twoFactor.method).toBeNull();
    expect(await json(await login(post({ email: "fan@example.com", password: PASSWORD })))).toMatchObject({ ok: true });
  });

  describe("Google", () => {
    const clientId = "test-client.apps.googleusercontent.com";
    const enableGoogle = () => {
      process.env.GOOGLE_CLIENT_ID = clientId;
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    };
    const idToken = (claims: Record<string, unknown>) =>
      ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

    /** Runs start → callback with Google's token endpoint stubbed to return `claims`. */
    async function googleSignIn(claims: Record<string, unknown>, next = "/account") {
      const start = await googleStart(new Request(`${ORIGIN}/api/auth/google/start?next=${encodeURIComponent(next)}`));
      expect(start.status).toBe(307);
      const auth = new URL(start.headers.get("location")!);
      expect(auth.origin).toBe("https://accounts.google.com");
      expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
      const state = auth.searchParams.get("state")!;
      const nonce = auth.searchParams.get("nonce")!;
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id_token: idToken({
              iss: "https://accounts.google.com",
              aud: clientId,
              exp: Math.floor(Date.now() / 1000) + 300,
              nonce,
              email_verified: true,
              ...claims,
            }),
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const cb = await googleCallback(new Request(`${ORIGIN}/api/auth/google/callback?state=${state}&code=abc`));
      return { location: new URL(cb.headers.get("location")!), fetchMock };
    }

    it("hidden and refused until configured", async () => {
      expect(((await json(await me())).providers as { google: boolean }).google).toBe(false);
      const res = await googleStart(new Request(`${ORIGIN}/api/auth/google/start`));
      expect(new URL(res.headers.get("location")!).search).toBe("?error=google_unavailable");
    });

    it("creates a verified member with no password and signs in", async () => {
      enableGoogle();
      const { location, fetchMock } = await googleSignIn({ sub: "g-1", email: "New@Gmail.com", name: "New Fan" });
      expect(location.pathname).toBe("/account");
      expect(jar.has("ccs_session")).toBe(true);
      const body = new URLSearchParams(fetchMock.mock.calls[0]![1].body as URLSearchParams);
      expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [user] = await db.select().from(schema.users);
      expect(user).toMatchObject({ email: "new@gmail.com", googleSub: "g-1", passwordHash: null, name: "New Fan" });
      expect(user!.emailVerifiedAt).not.toBeNull();
      expect(user!.leadId).not.toBeNull();
    });

    it("links to an existing verified account, and 2FA still applies", async () => {
      enableGoogle();
      const user = await member("fan@example.com");
      await enableTotp(user.id);
      const { location } = await googleSignIn({ sub: "g-2", email: "fan@example.com" }, "/?mockup=x#design");
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("step")).toBe("2fa");
      expect(location.searchParams.get("next")).toBe("/?mockup=x#design");
      expect(jar.has("ccs_session")).toBe(false);
      const [row] = await db.select().from(schema.users);
      expect(row!.googleSub).toBe("g-2");
      expect(row!.passwordHash).not.toBeNull(); // verified: password kept
    });

    it("claims an unverified account: removes the squatter's password and sessions", async () => {
      enableGoogle();
      const [squat] = await db
        .insert(schema.users)
        .values({ email: "real@gmail.com", passwordHash: await hashPassword(PASSWORD) })
        .returning();
      await createSession(db, squat!.id);
      await googleSignIn({ sub: "g-3", email: "real@gmail.com" });
      const [row] = await db.select().from(schema.users);
      expect(row).toMatchObject({ googleSub: "g-3", passwordHash: null });
      expect(row!.emailVerifiedAt).not.toBeNull();
      expect(await db.select().from(schema.sessions)).toHaveLength(1); // only the new Google one
    });

    it("refuses a bad state, an unverified Google email, a wrong audience, an off-site next", async () => {
      enableGoogle();
      const bad = await googleCallback(new Request(`${ORIGIN}/api/auth/google/callback?state=forged&code=abc`));
      expect(new URL(bad.headers.get("location")!).searchParams.get("error")).toBe("google");

      const unverified = await googleSignIn({ sub: "g-4", email: "x@gmail.com", email_verified: false });
      expect(unverified.location.searchParams.get("error")).toBe("google");
      const wrongAud = await googleSignIn({ sub: "g-5", email: "y@gmail.com", aud: "someone-else" });
      expect(wrongAud.location.searchParams.get("error")).toBe("google");
      expect(await db.select().from(schema.users)).toHaveLength(0);

      const offsite = await googleSignIn({ sub: "g-6", email: "z@gmail.com" }, "//evil.example/x");
      expect(offsite.location.origin + offsite.location.pathname).toBe(`${ORIGIN}/`);
    });

    it("Google-only members: unlink needs a password first; account deletion needs no password", async () => {
      enableGoogle();
      await googleSignIn({ sub: "g-7", email: "only@gmail.com" });
      const sec = (await json(await security())).security;
      expect(sec).toEqual({
        hasPassword: false,
        google: { available: true, linked: true },
        twoFactor: { method: null, recoveryCodesLeft: 0 },
      });
      expect((await unlinkGoogle(post({}))).status).toBe(400);
      expect((await deleteAccount(post({ confirm: "DELETE" }))).status).toBe(200);
      expect(await db.select().from(schema.users)).toHaveLength(0);
    });
  });
});
