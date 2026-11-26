import "server-only";

import { eq } from "drizzle-orm";

import { schema, type Db } from "../db";
import { currentUser } from "./session";

/** The signed-in member's full row (security routes need fields the session view leaves out). */
export async function currentMemberRow(db: Db) {
  const user = await currentUser(db);
  if (!user) return null;
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  return row ?? null;
}
