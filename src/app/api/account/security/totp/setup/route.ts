import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import QRCode from "qrcode";

import { currentMemberRow } from "@/lib/auth/member";
import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { sealSecret } from "@/lib/auth/secret-box";
import { generateTotpSecret, totpUri } from "@/lib/auth/totp";
import { getDb, schema } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { site } from "@/lib/site";

/**
 * Step 1 of turning on the authenticator app: a new secret (kept pending until a code
 * confirms it), as a QR code and as text for typing in by hand.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  const db = getDb();
  const user = await currentMemberRow(db);
  if (!user) return fail("Please log in first.", 401);
  if (user.twoFactorMethod) return fail("Two-step sign-in is already on. Turn it off first to switch methods.", 409);
  const rl = await rateLimit(db, { key: `security:${user.id}`, ...LIMITS.securityChange });
  if (!rl.ok) return fail("Too many changes. Please try again later.", 429);

  const secret = generateTotpSecret();
  await db
    .update(schema.users)
    .set({ totpPendingSecret: sealSecret(secret), updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  const uri = totpUri(secret, user.email, site.name);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return NextResponse.json(
    { ok: true, secret: secret.replace(/(.{4})/g, "$1 ").trim(), uri, qrSvg },
    { headers: { "cache-control": "no-store" } },
  );
}
