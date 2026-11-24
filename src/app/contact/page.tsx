import type { Metadata } from "next";

import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { ContactForm } from "@/components/forms/contact-form";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${site.name} in ${site.city}, ${site.region} for custom tees, hats, hoodies, and promo products.`,
};

export default function ContactPage() {
  return (
    <>
      <Section>
        <PageHeader eyebrow="Get in touch" title="Contact" />
        <div className="border-border bg-bg-2/60 mt-8 max-w-2xl rounded-2xl border p-6">
          <p className="text-text-2">
            Email is the fastest way to reach us. We serve {site.city} and the {site.areaServed}.
          </p>
          <a
            href={`mailto:${site.email}`}
            className="text-neon-cyan mt-3 inline-block font-mono underline-offset-4 hover:underline"
          >
            {site.email.toLowerCase()}
          </a>
          {site.phone ? (
            <p className="text-text-2 mt-2">
              Phone:{" "}
              <a href={`tel:${site.phone}`} className="text-neon-cyan hover:underline">
                {site.phone}
              </a>
            </p>
          ) : null}
          {site.address ? <p className="text-text-2 mt-2">{site.address}</p> : null}
          {site.hours ? <p className="text-text-2 mt-2">{site.hours}</p> : null}
        </div>
      </Section>

      <Section id="message" eyebrow="Send a message" title="Drop us a line">
        <div className="max-w-xl">
          <ContactForm />
        </div>
      </Section>
    </>
  );
}
