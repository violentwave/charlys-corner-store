import type { Metadata } from "next";

import { BuilderLoader } from "@/components/builder/builder-loader";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";

export const metadata: Metadata = {
  title: "Design Your Own",
  description:
    "Pick a shirt, raglan, hoodie, hat, polo, or tank, choose your colors, drop in your art, and get a free mockup plus 15% off your 2nd order.",
};

export default function DesignPage() {
  return (
    <Section>
      <PageHeader
        eyebrow="Build your own"
        title="Design your own mockup"
        description="Pick a garment, choose the colors, upload your art, and see it on the shirt — right here, right now."
      />
      <BuilderLoader />
    </Section>
  );
}
