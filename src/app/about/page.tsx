import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { ContactForm } from "@/components/forms/contact-form";
import { about } from "@/content/about";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: `The story behind ${site.name}: custom tees, hats, hoodies, and promo products in ${site.city}, ${site.region}.`,
};

export default function AboutPage() {
  return (
    <>
      <Section>
        <PageHeader eyebrow="Our story" title={about.headline} />
        <div className="text-text-2 mt-8 flex max-w-2xl flex-col gap-4">
          {about.story.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p className="font-heading text-neon-yellow tracking-widest uppercase">{about.signoff}</p>
        </div>

        <Card className="mt-10 max-w-2xl">
          <CardContent className="flex flex-col gap-2">
            <p className="font-heading text-text-1 text-sm tracking-widest uppercase">Photos of Charly coming soon</p>
            {/* TODO(content): photos of Charly and the shop, owner to provide (Brief Q8). */}
            <p className="text-text-2 text-sm">We&apos;re gathering photos of Charly and the shop.</p>
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/#design">Design Your Own</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/contact">Get in touch</Link>
          </Button>
        </div>
      </Section>

      <Section id="custom-order" eyebrow="Custom order request" title="Tell us what you need">
        <div className="max-w-xl">
          <ContactForm sourcePage="about" />
        </div>
      </Section>
    </>
  );
}
