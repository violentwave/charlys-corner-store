import Link from "next/link";

import { Section } from "@/components/sections/section";
import { ProductGrid } from "@/components/sections/product-grid";
import { QuoteForm } from "@/components/forms/quote-form";
import { businessProducts, HOME_SUMMARY_PRODUCT_COUNT } from "@/components/sections/business-products";
import { legacyPromoItems } from "@/content/catalog";
import { site } from "@/lib/site";

/**
 * Home #business: summary of the full /business page — short pitch, the first products of
 * the merged grid, the quote form, and a link to the full page (don't copy the page text).
 */
export function BusinessSummary() {
  return (
    <Section
      id="business"
      eyebrow="Business & promo"
      title="Business & Promotional Products"
      description="We help brand your business: hats, koozies, totes, mouse pads, pop sockets, plus business cards, flyers, stickers, lanyards, pillows, and banners."
    >
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-6">
          <ul className="flex flex-wrap gap-2">
            {legacyPromoItems.map((item) => (
              <li key={item} className="border-border bg-bg-3 text-text-2 rounded-full border px-3 py-1 text-sm">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-text-2">
            Need something not listed? Email us and we&apos;ll see what we can do.{" "}
            <a href={`mailto:${site.email}`} className="text-neon-cyan font-mono underline-offset-4 hover:underline">
              {site.email.toLowerCase()}
            </a>
          </p>
          <ProductGrid items={businessProducts.slice(0, HOME_SUMMARY_PRODUCT_COUNT)} />
          <Link href="/business" className="text-neon-cyan text-sm underline-offset-4 hover:underline">
            See all products &amp; services →
          </Link>
        </div>

        <div className="border-t border-dashed pt-2">
          <div id="quote" className="mt-6 flex flex-col gap-4">
            <h3 className="font-heading text-text-1 text-lg tracking-wide uppercase sm:text-xl">
              Tell us what you need
            </h3>
            <p className="text-text-2 text-sm">Bulk orders, deadlines, logos on everything — ask for a quote.</p>
          </div>
          <div className="mt-6 max-w-xl">
            <QuoteForm />
          </div>
        </div>
      </div>
    </Section>
  );
}
