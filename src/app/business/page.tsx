import type { Metadata } from "next";

import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { ProductGrid } from "@/components/sections/product-grid";
import { PortfolioGallery } from "@/components/sections/portfolio-gallery";
import { businessProducts } from "@/components/sections/business-products";
import { QuoteForm } from "@/components/forms/quote-form";
import { PageTransition } from "@/components/layout/page-transition";
import { legacyPromoItems } from "@/content/catalog";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Business & Promotional Products",
  description: `Brand your business with custom hats, koozies, totes, mouse pads, pop sockets, cards, flyers, stickers, lanyards, pillows, and banners in ${site.city}, ${site.region}.`,
};

export default function BusinessPage() {
  return (
    <PageTransition>
      <Section>
        <PageHeader
          eyebrow="Business & promo"
          title="Business & Promotional Products"
          description="We help brand your business. Hats, koozies, totes, mouse pads, pop sockets, plus business cards, flyers, stickers, lanyards, pillows, and banners."
        />
        <ul className="mt-6 flex flex-wrap gap-2">
          {legacyPromoItems.map((item) => (
            <li key={item} className="border-border bg-bg-3 text-text-2 rounded-full border px-3 py-1 text-sm">
              {item}
            </li>
          ))}
        </ul>
        <p className="text-text-2 mt-4">Need something not listed? Email us and we&apos;ll see what we can do.</p>
        <a
          href={`mailto:${site.email}`}
          className="text-neon-cyan mt-3 inline-block font-mono underline-offset-4 hover:underline"
        >
          Email us for orders: {site.email.toLowerCase()}
        </a>
      </Section>

      <Section id="products" eyebrow="Catalog" title="Products">
        <ProductGrid items={businessProducts} />
      </Section>

      <Section id="gallery" eyebrow="Past work" title="Past jobs">
        <PortfolioGallery />
      </Section>

      <Section id="quote" eyebrow="Get a quote" title="Tell us what you need">
        <div className="max-w-xl">
          <QuoteForm />
        </div>
      </Section>
    </PageTransition>
  );
}
