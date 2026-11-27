import { BuilderLoader } from "@/components/builder/builder-loader";
import { StudioHero } from "@/components/builder/studio-hero";
import { Section } from "@/components/sections/section";
import { COUPON_RULES } from "@/lib/coupons";

const minOrderDollars = (COUPON_RULES.minOrderCents / 100).toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
});

/**
 * Home #design: the studio hero band, then the mockup builder (Logan, 2026-11-25).
 * The hero carries the id so "Design Your Own" lands on the chrome title (the section's
 * focus target); the coupon line stays inside it for the Home copy.
 */
export function DesignSection() {
  return (
    <>
      <StudioHero
        id="design"
        srTitle="Design your own custom gear"
        titleAs="h2"
        sectionHeading
        note={`After your first paid order, ${COUPON_RULES.percentOff}% off your next one (${minOrderDollars} minimum).`}
      />
      <Section className="pt-6 sm:pt-8">
        <BuilderLoader />
      </Section>
    </>
  );
}
