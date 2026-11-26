import "server-only";

import { randomInt } from "node:crypto";

import { sha256 } from "./tokens";

/** One-time backup codes for when the member loses their phone. 10 of them, shown once. */
export const RECOVERY_CODE_COUNT = 10;
// No 0/O/1/I/L: easy to read off paper.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "XXXX-XXXX" × 10. Only hashes are stored. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

/** Case, spaces and the dash don't matter when a member types one back in. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export function hashRecoveryCode(userId: string, code: string): string {
  return sha256(`recovery:${userId}:${normalizeRecoveryCode(code)}`);
}

export function looksLikeRecoveryCode(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(normalizeRecoveryCode(code));
}
