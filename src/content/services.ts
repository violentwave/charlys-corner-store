/**
 * Decoration methods / services. Confirmed sources:
 * - Screen printing: the business (Logan, project brief).
 * - DTF printing and embroidery: old site's meta description.
 * - Print products (cards, flyers, stickers, banners) and promo items: old site + owner (2026-11-23).
 *
 * "bestFor" lines are general industry guidance, not shop-specific promises.
 * Turnaround, minimums, and pricing are unknown: TODO(content) (Brief Q3, Q7).
 */

export type Service = {
  slug: string;
  name: string;
  summary: string;
  bestFor: string[];
};

export const services: readonly Service[] = [
  {
    slug: "screen-printing",
    name: "Screen Printing",
    summary: "Ink pushed through a mesh screen, one color at a time. Bold, durable prints.",
    bestFor: [
      "Larger runs of the same design",
      "Simple designs with a few solid colors",
      "Team, event, and staff shirts",
    ],
  },
  {
    slug: "dtf-printing",
    name: "DTF (Direct-to-Film) Printing",
    summary: "Your design is printed on film and heat-pressed onto the garment. Full color, fine detail.",
    bestFor: ["Full-color art and photos", "Small runs and one-offs", "Lots of colors or gradients"],
  },
  {
    slug: "embroidery",
    name: "Embroidery",
    summary: "Your design stitched into the fabric with thread. A clean, professional finish.",
    bestFor: ["Polos, hats, and uniforms", "Logos on the left chest", "A premium look that lasts"],
  },
  {
    slug: "print-and-promo",
    name: "Print & Promo Products",
    summary: "Business cards, flyers, stickers, banners, lanyards, koozies, and more with your brand on it.",
    bestFor: ["Branding a small business", "Events and giveaways", "Signage indoors and out"],
  },
] as const;
