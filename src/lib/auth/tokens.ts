import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

/** 32 random bytes, base64url (43 chars): session cookies and password-reset links. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Uniform 6-digit code, leading zeros kept. */
export function verificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Codes are only 6 digits, so they're hashed together with the user id (and capped at 5 attempts). */
export function codeHash(userId: string, code: string): string {
  return sha256(`${userId}:${code}`);
}
