import { NextResponse } from "next/server";

import type { AccountUser } from "@/lib/auth-schema";
import { googleConfig } from "@/lib/auth/google";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

/** The signed-in account, or { user: null }, plus the available sign-in providers. Never cached. */
export async function GET() {
  const user = await currentUser(getDb());
  const body: AccountUser | null = user
    ? { email: user.email, name: user.name, verified: !!user.emailVerifiedAt }
    : null;
  // Which sign-in buttons to show (Google only once its OAuth client is configured).
  return NextResponse.json(
    { user: body, providers: { google: !!googleConfig() } },
    { headers: { "cache-control": "no-store" } },
  );
}
