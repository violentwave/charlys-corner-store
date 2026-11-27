import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/sections/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { Section } from "@/components/sections/section";
import { services } from "@/content/services";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Services",
  description: `Screen printing, DTF, embroidery, and print/promo products in ${site.city}, ${site.region}.`,
};

export default function ServicesPage() {
  return (
    <PageTransition>
      <Section>
        <PageHeader
          eyebrow="What we do"
          title="Services"
          description="The decoration methods and print products we offer. Pick the one that fits your design and run size."
        />
      </Section>

      {services.map((service) => (
        <Section key={service.slug} id={service.slug} eyebrow="Service" title={service.name}>
          <p className="text-text-2 max-w-2xl">{service.summary}</p>
          <h3 className="font-heading text-text-1 mt-6 text-sm tracking-widest uppercase">Best for</h3>
          <ul className="text-text-2 mt-2 list-disc pl-5">
            {service.bestFor.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ))}

      <Section eyebrow="Compare" title="Which method fits?">
        <div className="border-border overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-bg-3 text-text-1">
              <tr>
                <th className="font-heading px-4 py-3 tracking-wide uppercase">Method</th>
                <th className="font-heading px-4 py-3 tracking-wide uppercase">Best for</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.slug} className="border-border border-t">
                  <td className="text-text-1 px-4 py-3 font-medium">{service.name}</td>
                  <td className="text-text-2 px-4 py-3">{service.bestFor.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="Next step" title="Ready to start?">
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/#design">Design Your Own</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/business#quote">Get a Quote</Link>
          </Button>
        </div>
      </Section>
    </PageTransition>
  );
}
