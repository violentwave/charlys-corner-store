import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Section } from "@/components/sections/section";
import { about } from "@/content/about";

const audiences = [
  {
    title: "Locals & gifts",
    body: "Funny everyday captions, family reunions, memorial shirts, and one-of-a-kind gifts.",
  },
  {
    title: "Small businesses",
    body: "Uniforms, polos, hats, business cards, flyers, stickers, and branded promo items.",
  },
  {
    title: "Teams, schools & fundraisers",
    body: "Bulk orders and fundraiser shirts, including memorial shirts that give back.",
  },
] as const;

/**
 * Home #about: two sentences of the Charly story plus the "Made for the Treasure Coast"
 * audiences, ending in a link to the full /about page (don't copy the page text).
 */
export function AboutSummary() {
  return (
    <Section id="about" eyebrow="Our story" title={about.headline}>
      <div className="flex flex-col gap-10">
        <div className="text-text-2 flex max-w-2xl flex-col gap-4">
          {about.story.slice(0, 2).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p className="font-heading text-neon-yellow tracking-widest uppercase">{about.signoff}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {audiences.map((audience) => (
            <Card key={audience.title}>
              <CardHeader>
                <CardTitle>{audience.title}</CardTitle>
              </CardHeader>
              <CardContent>{audience.body}</CardContent>
            </Card>
          ))}
        </div>

        <Link href="/about" className="text-neon-cyan text-sm underline-offset-4 hover:underline">
          Read our story →
        </Link>
      </div>
    </Section>
  );
}
