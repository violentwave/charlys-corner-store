import "server-only";

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encrypts small secrets stored in the database (authenticator-app secrets), so a database
 * leak alone doesn't hand out everyone's second factor. AES-256-GCM with the key from
 * AUTH_ENCRYPTION_KEY (32 bytes, base64: `openssl rand -base64 32`). Format:
 * `v1.<iv>.<tag>.<ciphertext>` (base64url).
 *
 * Production must set the key. Development and tests fall back to a fixed, public dev key
 * so the app runs without setup; never use that outside your machine.
 */
const DEV_KEY = createHash("sha256").update("charlys-dev-only-auth-encryption-key").digest();

function key(): Buffer {
  const raw = process.env.AUTH_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("AUTH_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)");
    return k;
  }
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_ENCRYPTION_KEY is not set");
  return DEV_KEY;
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(
    ".",
  );
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unreadable secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * A separate key for another purpose (e.g. signing the owner's one-click order links),
 * derived from AUTH_ENCRYPTION_KEY with HKDF so there's one secret to manage.
 */
export function derivedKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", key(), Buffer.alloc(0), `charlys:${purpose}`, 32));
}
