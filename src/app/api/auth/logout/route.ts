import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/origin";
import { fail } from "@/lib/auth/route-helpers";
import { endSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  await endSession(getDb());
  return NextResponse.json({ ok: true });
}
