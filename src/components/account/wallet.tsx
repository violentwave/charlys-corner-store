"use client";
/**
 * The member's coupon from the wallet (docs/02 Member perks): the same CouponTicket the
 * success screen shows, with a status line. Renders nothing when there's no coupon yet.
 */
import { useEffect, useState } from "react";

import type { WalletCoupon } from "@/app/api/account/wallet/route";
import { CouponTicket } from "@/components/neon/coupon-ticket";

const STATUS_TEXT: Record<WalletCoupon["status"], string> = {
  issued: "Unlocks after your first order",
  eligible: "Ready to use",
  redeemed: "Used",
  expired: "Expired",
};

export function Wallet() {
  const [coupon, setCoupon] = useState<WalletCoupon | null | "loading">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/api/account/wallet", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { coupon?: WalletCoupon | null } | null;
        if (alive) setCoupon(data?.coupon ?? null);
      })
      .catch(() => {
        if (alive) setCoupon(null); // no coupon shown on fetch trouble; not an alert-worthy error
      });
    return () => {
      alive = false;
    };
  }, []);

  if (coupon === "loading" || coupon === null) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="wallet">
      <p className="font-heading text-text-1 text-sm tracking-widest uppercase">Your coupon</p>
      <CouponTicket code={coupon.code} expiresAt={new Date(coupon.expiresAt)} />
      <p className="text-text-2 text-sm" data-testid="wallet-status">
        {STATUS_TEXT[coupon.status]}
      </p>
    </div>
  );
}
