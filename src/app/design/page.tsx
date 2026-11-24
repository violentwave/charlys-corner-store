import type { Metadata } from "next";

import { ComingSoon } from "@/components/neon/coming-soon";

export const metadata: Metadata = { title: "Design Your Own" };

export default function DesignPage() {
  return (
    <ComingSoon
      title="Design Your Own"
      phase="Phase 4"
      description="Pick a shirt, raglan, hoodie, hat, polo, or tank, choose your colors, drop in your art, and get a free mockup plus 15% off your 2nd order."
    />
  );
}
