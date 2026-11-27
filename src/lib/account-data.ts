import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { schema, type Db } from "./db";
import type { StorageDriver } from "./storage";

/**
 * Member data removal (Logan, 2026-11-26).
 * - Emailed mockups: the row and its files (originals + rendered PNGs) are deleted.
 * - Order requests: hidden from "My designs" only. The owner still needs the order and its
 *   artwork to quote and print it. Hiding one design of an order hides the whole order.
 * Storage deletes are best-effort: a file that's already gone (30-day lifecycle rule) is fine.
 */

type MockupRow = typeof schema.mockups.$inferSelect;

export function mockupFileKeys(row: Pick<MockupRow, "artworks" | "artworkKey" | "views">): string[] {
  const keys = new Set<string>();
  for (const a of row.artworks) keys.add(a.key);
  if (row.artworkKey) keys.add(row.artworkKey);
  for (const v of row.views) if (v.mockupKey) keys.add(v.mockupKey);
  return [...keys];
}

async function deleteFiles(storage: StorageDriver, keys: string[]) {
  await Promise.all(keys.map((key) => storage.delete(key).catch(() => undefined)));
}

export type RemoveDesignResult = "deleted" | "hidden" | "not_found";

/** Removes one of the member's designs. Someone else's design is "not_found" (no leaking ids). */
export async function removeMemberDesign(
  db: Db,
  storage: StorageDriver,
  userId: string,
  mockupId: string,
): Promise<RemoveDesignResult> {
  const [row] = await db
    .select()
    .from(schema.mockups)
    .where(
      and(eq(schema.mockups.id, mockupId), eq(schema.mockups.userId, userId), isNull(schema.mockups.hiddenByUserAt)),
    );
  if (!row) return "not_found";
  if (row.kind === "order") {
    if (row.orderId) {
      await db
        .update(schema.orders)
        .set({ hiddenByUserAt: new Date() })
        .where(and(eq(schema.orders.id, row.orderId), isNull(schema.orders.hiddenByUserAt)));
    } else {
      await db.update(schema.mockups).set({ hiddenByUserAt: new Date() }).where(eq(schema.mockups.id, row.id));
    }
    return "hidden";
  }
  await db.delete(schema.mockups).where(eq(schema.mockups.id, row.id));
  await deleteFiles(storage, mockupFileKeys(row));
  return "deleted";
}

/**
 * Deletes the account: emailed mockups (rows + files), drafts, brand kit and size sets (rows +
 * files), sessions and codes (cascade), the user
 * row. Order requests stay for the owner, detached from the account (user_id → null). The
 * lead (email + coupon) stays as the shop's customer record; full erasure is by email request
 * (privacy page).
 */
export async function deleteMemberAccount(db: Db, storage: StorageDriver, userId: string): Promise<void> {
  const mockups = await db
    .select()
    .from(schema.mockups)
    .where(and(eq(schema.mockups.userId, userId), eq(schema.mockups.kind, "mockup")));
  // Drafts, brand kit and size sets go with the user row (ON DELETE CASCADE); their files here.
  const drafts = await db.select().from(schema.drafts).where(eq(schema.drafts.userId, userId));
  const [brandKit] = await db.select().from(schema.brandKits).where(eq(schema.brandKits.userId, userId));
  await db.transaction(async (tx) => {
    await tx.delete(schema.mockups).where(and(eq(schema.mockups.userId, userId), eq(schema.mockups.kind, "mockup")));
    await tx.delete(schema.users).where(eq(schema.users.id, userId));
  });
  await deleteFiles(storage, [
    ...mockups.flatMap((m) => mockupFileKeys(m)),
    ...drafts.flatMap((d) => d.artworks.map((a) => a.key)),
    ...(brandKit?.logo ? [brandKit.logo.key] : []),
  ]);
}
