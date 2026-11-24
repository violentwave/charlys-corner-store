import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Section } from "@/components/sections/section";
import { Hero } from "@/components/neon/hero";
import { ReferralSurvey } from "@/components/forms/referral-survey";
import { catalog, formatPrice } from "@/content/catalog";
import { services } from "@/content/services";
import { portfolio } from "@/content/portfolio";
import { site } from "@/lib/site";
import { COUPON_RULES } from "@/lib/coupons";

export const metadata: Metadata = {
  description: `Custom tees, hats, hoodies, and promo products in ${site.city}, ${site.region}. ${site.tagline}!`,
};

const featuredSlugs = [
  "gildan-cotton-tees",
  "custom-hats",
  "business-cards",
  "custom-foam-koozies",
  "austin-hodge-memorial-shirt",
  "banners",
] as const;

const featuredProducts = featuredSlugs
  .map((slug) => catalog.find((product) => product.slug === slug))
  .filter((product): product is (typeof catalog)[number] => Boolean(product));

const pastWork = [...portfolio].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 6);

const minOrderDollars = (COUPON_RULES.minOrderCents / 100).toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
});

export default function Home() {
  return (
    <>
      <Hero
        eyebrow="Port St. Lucie, FL"
        title="Wear the message. Make the moment."
        subtitle="Custom tees, hats, hoodies, and promo products printed on the Treasure Coast. Design your own mockup online or send us your art."
        actions={
          <>
            <Button asChild>
              <Link href="/design">Design Your Own</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/business#quote">Get a Quote</Link>
            </Button>
          </>
        }
      />

      <Section
        id="services"
        eyebrow="What we do"
        title="Services"
        description="From one-off tees to full business branding, we print it in Port St. Lucie."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <Card key={service.slug} interactive>
              <CardHeader>
                <CardTitle>{service.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p>{service.summary}</p>
                <Link
                  href={`/services#${service.slug}`}
                  className="text-neon-cyan text-sm underline-offset-4 hover:underline"
                >
                  Learn more
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="featured"
        eyebrow="Shop"
        title="Featured products"
        description="A few favorites from the catalog. See the full shop for every option."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredProducts.map((product) => (
            <Card key={product.slug}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{product.name}</CardTitle>
                  {product.category === "memorial" ? <Badge variant="yellow">Memorial · gives back</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm">{product.blurb}</p>
                <p className="text-neon-yellow font-mono">{formatPrice(product)}</p>
                <Link href="/shop" className="text-neon-cyan text-sm underline-offset-4 hover:underline">
                  View in shop
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="builder"
        eyebrow="Build your own"
        title="Design your own mockup"
        description="Pick a garment, choose a color, upload your design, and see it come to life. Then email it to us and get a real quote."
      >
        <div className="border-border bg-bg-2/60 flex flex-col gap-6 rounded-2xl border p-6 sm:p-8">
          <p className="text-text-2 max-w-2xl">
            Use the mockup builder to try out your idea before you commit. When you submit, we send the mockup to your
            inbox along with a coupon for{" "}
            <span className="text-neon-yellow font-mono">{COUPON_RULES.percentOff}% off your 2nd order</span> (minimum
            order {minOrderDollars}).
          </p>
          <div>
            <Button asChild>
              <Link href="/design">Start designing</Link>
            </Button>
          </div>
        </div>
      </Section>

      <Section id="how-it-works" eyebrow="Process" title="How it works">
        <ol className="grid gap-4 sm:grid-cols-3">
          <li className="border-border bg-bg-2/60 rounded-2xl border p-6">
            <span className="font-heading text-neon-cyan text-sm tracking-widest">01</span>
            <h3 className="font-heading text-text-1 mt-2 text-lg">Design or send your art</h3>
            <p className="text-text-2 mt-2 text-sm">
              Use the mockup builder, or upload artwork for an order you&apos;ve already placed.
            </p>
          </li>
          <li className="border-border bg-bg-2/60 rounded-2xl border p-6">
            <span className="font-heading text-neon-cyan text-sm tracking-widest">02</span>
            <h3 className="font-heading text-text-1 mt-2 text-lg">We print it in Port St. Lucie</h3>
            <p className="text-text-2 mt-2 text-sm">Screen print, DTF, or embroidery on the blank you choose.</p>
          </li>
          <li className="border-border bg-bg-2/60 rounded-2xl border p-6">
            <span className="font-heading text-neon-cyan text-sm tracking-widest">03</span>
            <h3 className="font-heading text-text-1 mt-2 text-lg">We reach out to finalize and deliver</h3>
            <p className="text-text-2 mt-2 text-sm">
              We confirm details, pricing, and pickup or shipping before anything ships.
            </p>
          </li>
        </ol>
      </Section>

      <Section id="audiences" eyebrow="Who we make it for" title="Made for the Treasure Coast">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Locals &amp; gifts</CardTitle>
            </CardHeader>
            <CardContent>
              Funny everyday captions, family reunions, memorial shirts, and one-of-a-kind gifts.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Small businesses</CardTitle>
            </CardHeader>
            <CardContent>Uniforms, polos, hats, business cards, flyers, stickers, and branded promo items.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Teams, schools &amp; fundraisers</CardTitle>
            </CardHeader>
            <CardContent>Bulk orders and fundraiser shirts, including memorial shirts that give back.</CardContent>
          </Card>
        </div>
      </Section>

      <Section id="past-work" eyebrow="Past work" title="Real jobs from the shop" description="A few recent pieces.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pastWork.map((item) => (
            <figure key={item.src} className="flex flex-col gap-2">
              <div
                className="border-border bg-bg-2/60 overflow-hidden rounded-xl border"
                style={{ maxWidth: item.width }}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={item.width}
                  height={item.height}
                  className="h-auto w-full object-contain"
                />
              </div>
              <figcaption className="text-text-3 text-xs">{item.caption}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section
        id="referral"
        eyebrow="Quick question"
        title="How did you hear about us?"
        description="It helps a small shop know what's working."
      >
        <div className="max-w-xl">
          <ReferralSurvey />
        </div>
      </Section>
    </>
  );
}
