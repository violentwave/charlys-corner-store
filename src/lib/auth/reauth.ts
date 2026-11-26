import "server-only";

import { schema, type Db } from "../db";
import { verifyPassword } from "./password";
import { checkSecondFactor } from "./two-factor";

type UserRow = typeof schema.users.$inferSelect;

export type ConfirmResult = { ok: true } | { ok: false; field: "password" | "code"; message: string };

/**
 * Re-confirms the member before a sensitive change: their password if the account has one,
 * and a second-factor code if 2FA is on. A Google-only account without 2FA has neither:
 * being signed in is the proof.
 */
export async function confirmIdentity(
  db: Db,
  user: UserRow,
  input: { password?: string; code?: string },
): Promise<ConfirmResult> {
  if (user.passwordHash) {
    if (!input.password || !(await verifyPassword(input.password, user.passwordHash))) {
      return { ok: false, field: "password", message: "That password isn't right." };
    }
  }
  if (user.twoFactorMethod) {
    if (!input.code || !(await checkSecondFactor(db, user, input.code)).ok) {
      return { ok: false, field: "code", message: "That code isn't right." };
    }
  }
  return { ok: true };
}
