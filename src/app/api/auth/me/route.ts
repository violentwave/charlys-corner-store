import { NextResponse } from "next/server";

import type { AccountUser } from "@/lib/auth-schema";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

/** The signed-in account, or { user: null }. Never cached. */
export async function GET() {
  const user = await currentUser(getDb());
  const body: AccountUser | null = user
    ? { email: user.email, name: user.name, verified: !!user.emailVerifiedAt }
    : null;
  return NextResponse.json({ user: body }, { headers: { "cache-control": "no-store" } });
}
