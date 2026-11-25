import type { AccountUser } from "@/lib/auth-schema";

/** The upload gate decision for the current account (docs/04 Flow v2). */
export function uploadGateFor(user: AccountUser | null): "signedOut" | "unverified" | "allowed" {
  if (!user) return "signedOut";
  return user.verified ? "allowed" : "unverified";
}
