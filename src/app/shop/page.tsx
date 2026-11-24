import type { Metadata } from "next";

import { ComingSoon } from "@/components/neon/coming-soon";

export const metadata: Metadata = { title: "Shop" };

export default function ShopPage() {
  return (
    <ComingSoon
      title="Shop"
      phase="Phase 5"
      description="Order tees, hats, polos, banners, business cards, and more online."
    />
  );
}
