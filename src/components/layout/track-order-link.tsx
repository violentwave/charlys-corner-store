"use client";

import Link from "next/link";

import { useSession } from "@/components/layout/session";

/**
 * Footer "Track an order" row: members go straight to /account#designs; visitors get the
 * login page with that destination as the `next` param. Nothing renders while
 * /api/auth/me is loading (no wrong destination flashed).
 */
export function TrackOrderLink() {
  const { loading, user } = useSession();

  if (loading)
    return (
      <span aria-hidden="true" className="bg-bg-3 h-4 w-24 animate-pulse rounded-full motion-reduce:animate-none" />
    );

  return user ? (
    <Link href="/account#designs" className="text-text-2 hover:text-neon-cyan text-sm transition-colors">
      Track an order
    </Link>
  ) : (
    <Link
      href={`/login?next=${encodeURIComponent("/account#designs")}`}
      className="text-text-2 hover:text-neon-cyan text-sm transition-colors"
    >
      Track an order
    </Link>
  );
}
