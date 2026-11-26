import { NextResponse } from "next/server";

import type { AccountSecurity } from "@/lib/auth-schema";
import { googleConfig } from "@/lib/auth/google";
import { currentMemberRow } from "@/lib/auth/member";
import { fail } from "@/lib/auth/route-helpers";
import { getDb } from "@/lib/db";

/** GET /api/account/security: what the Security tab shows. */
export async function GET() {
  const user = await currentMemberRow(getDb());
  if (!user) return fail("Please log in first.", 401);
  const body: AccountSecurity = {
    hasPassword: !!user.passwordHash,
    google: { available: !!googleConfig(), linked: !!user.googleSub },
    twoFactor: { method: user.twoFactorMethod, recoveryCodesLeft: user.recoveryCodeHashes.length },
  };
  return NextResponse.json({ ok: true, security: body }, { headers: { "cache-control": "no-store" } });
}
