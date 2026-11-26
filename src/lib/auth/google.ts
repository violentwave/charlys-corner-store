import "server-only";

import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { schema, type Db } from "../db";
import { site } from "../site";
import { markEmailVerified } from "./email-tokens";
import { revokeAllSessions } from "./session";

/**
 * "Continue with Google" (Logan, 2026-11-26): plain OpenID Connect, authorization-code flow
 * with PKCE, no SDK (portability). Needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET from a
 * Google Cloud OAuth client whose redirect URI is `${NEXT_PUBLIC_SITE_URL}/api/auth/google/callback`.
 * Without them the button is hidden and the routes answer "not available".
 *
 * The ID token comes straight from Google's token endpoint over TLS in exchange for our
 * client secret, so its signature doesn't need checking (OIDC Core §3.1.3.7); the claims
 * (issuer, audience, expiry, nonce, verified email) are still checked.
 */
export const GOOGLE_COOKIE = "ccs_google";
export const GOOGLE_FLOW_MINUTES = 10;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${site.url.replace(/\/$/, "")}/api/auth/google/callback` };
}

/** Only same-site paths ("/account", "/?mockup=…#design"): never another origin. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.length > 500)
    return "/";
  return next;
}

export type GoogleFlow = { state: string; verifier: string; nonce: string; next: string };

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function authorizationUrl(config: GoogleConfig, flow: GoogleFlow): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: pkceChallenge(flow.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleIdentity = { sub: string; email: string; name: string | null };

/** Exchanges the code for tokens and returns the checked identity, or null. */
export async function exchangeCode(
  config: GoogleConfig,
  code: string,
  flow: GoogleFlow,
  now = Date.now(),
): Promise<GoogleIdentity | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: flow.verifier,
    }),
  });
  if (!res.ok) return null;
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) return null;
  return checkIdToken(tokens.id_token, config, flow.nonce, now);
}

/** Decodes the ID token's claims and checks them (see the module note on signatures). */
export function checkIdToken(
  idToken: string,
  config: GoogleConfig,
  nonce: string,
  now = Date.now(),
): GoogleIdentity | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const aud = claims.aud;
  const audOk = aud === config.clientId || (Array.isArray(aud) && aud.includes(config.clientId));
  if (!ISSUERS.has(String(claims.iss)) || !audOk) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 < now) return null;
  if (claims.nonce !== nonce) return null;
  // Only a Google-verified email can create or link an account.
  if (claims.email_verified !== true || typeof claims.email !== "string" || typeof claims.sub !== "string") return null;
  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    name: typeof claims.name === "string" ? claims.name.slice(0, 100) : null,
  };
}

type UserRow = typeof schema.users.$inferSelect;

/**
 * Finds or creates the member for a Google identity:
 * - already linked (google_sub) → that member;
 * - same email, verified → link Google to it;
 * - same email, NOT verified → someone may have signed up with this address without owning
 *   it: Google proves ownership, so the account is claimed: its password is removed and its
 *   sessions are signed out, then Google is linked;
 * - new email → a new member with no password, email verified.
 */
export async function resolveGoogleUser(db: Db, identity: GoogleIdentity): Promise<UserRow> {
  const [linked] = await db.select().from(schema.users).where(eq(schema.users.googleSub, identity.sub));
  if (linked) return linked;

  const [byEmail] = await db.select().from(schema.users).where(eq(schema.users.email, identity.email));
  if (byEmail) {
    const claim = !byEmail.emailVerifiedAt;
    if (claim) await revokeAllSessions(db, byEmail.id);
    await db
      .update(schema.users)
      .set({
        googleSub: identity.sub,
        ...(claim ? { passwordHash: null, twoFactorMethod: null, totpSecret: null, recoveryCodeHashes: [] } : {}),
        name: byEmail.name ?? identity.name,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.users.id, byEmail.id)));
    await markEmailVerified(db, byEmail.id);
    const [updated] = await db.select().from(schema.users).where(eq(schema.users.id, byEmail.id));
    return updated!;
  }

  const [created] = await db
    .insert(schema.users)
    .values({ email: identity.email, name: identity.name, passwordHash: null, googleSub: identity.sub })
    .returning();
  await markEmailVerified(db, created!.id);
  const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, created!.id));
  return fresh!;
}
