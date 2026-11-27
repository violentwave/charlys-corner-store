import type { Metadata } from "next";

import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { ContactDetails } from "@/components/sections/contact-details";
import { ContactForm } from "@/components/forms/contact-form";
import { PageTransition } from "@/components/layout/page-transition";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${site.name} in ${site.city}, ${site.region} for custom tees, hats, hoodies, and promo products.`,
};

export default function ContactPage() {
  return (
    <PageTransition>
      <Section>
        <PageHeader eyebrow="Get in touch" title="Contact" />
        <div className="mt-8 max-w-2xl">
          <ContactDetails />
        </div>
      </Section>

      <Section id="message" eyebrow="Send a message" title="Drop us a line">
        <div className="max-w-xl">
          <ContactForm sourcePage="contact" />
        </div>
      </Section>
    </PageTransition>
  );
}
