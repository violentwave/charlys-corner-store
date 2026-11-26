"use client";

import Link from "next/link";

import { BuilderLoader } from "@/components/builder/builder-loader";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { site } from "@/lib/site";
import { COUPON_RULES } from "@/lib/coupons";

const minOrderDollars = (COUPON_RULES.minOrderCents / 100).toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
});

/** Home #design: the mockup builder is the first thing on the page (Logan, 2026-11-25). */
export function DesignSection() {
  return (
    <Section id="design" className="pt-8 sm:pt-12">
      <PageHeader
        eyebrow={`${site.city}, ${site.region} · Custom apparel`}
        title="Design your own custom gear"
        description={`Pick a tee, performance shirt, raglan, hoodie, hat, polo, or tank, choose your colors and print method, and drop in your art. We'll email you the mockup plus ${COUPON_RULES.percentOff}% off your 2nd order (${minOrderDollars} minimum).`}
      />
      <p className="text-text-2 mt-3 text-sm">
        Already ordered?{" "}
        <Link href="#upload" className="text-neon-cyan underline-offset-4 hover:underline">
          Upload your artwork ↓
        </Link>
      </p>
      <div className="mt-8">
        <BuilderLoader />
      </div>
    </Section>
  );
}
