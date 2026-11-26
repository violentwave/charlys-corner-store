import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DesignSection } from "@/components/sections/home/design-section";
import { UploadSection } from "@/components/sections/home/upload-section";
import { ServicesSection } from "@/components/sections/home/services-section";
import { HowItWorksSection } from "@/components/sections/home/how-it-works-section";
import { BusinessSummary } from "@/components/sections/home/business-summary";
import { PastWorkSection } from "@/components/sections/home/past-work-section";
import { AboutSummary } from "@/components/sections/home/about-summary";
import { ContactSummary } from "@/components/sections/home/contact-summary";
import { Hero } from "@/components/neon/hero";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  description: `Custom tees, hats, hoodies, and promo products in ${site.city}, ${site.region}. ${site.tagline}!`,
};

export default function Home() {
  return (
    <>
      {/* One-page Home (Logan, 2026-11-26): builder, upload, then summary sections.
          Business, About and Contact stay full pages — these are the trimmed versions. */}
      <DesignSection />
      <UploadSection />

      <Hero
        titleAs="h2"
        eyebrow="Printed on the Treasure Coast"
        title="Wear the message. Make the moment."
        subtitle="Custom tees, hats, hoodies, and promo products printed in Port St. Lucie. Design it above, or send us your art and we'll take it from there."
        actions={
          <>
            <Button asChild>
              <Link href="#business">Get a Quote</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="#upload">Upload Artwork</Link>
            </Button>
          </>
        }
      />

      <ServicesSection />
      <HowItWorksSection />
      <BusinessSummary />
      <PastWorkSection />
      <AboutSummary />
      <ContactSummary />
    </>
  );
}
