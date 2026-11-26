import "server-only";

import { eq } from "drizzle-orm";

import { schema, type Db } from "../db";
import { generateRecoveryCodes, hashRecoveryCode } from "./recovery-codes";

/** Replaces the member's backup codes; returns the new ones (shown once, never stored raw). */
export async function issueBackupCodes(db: Db, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db
    .update(schema.users)
    .set({ recoveryCodeHashes: codes.map((c) => hashRecoveryCode(userId, c)), updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
  return codes;
}
