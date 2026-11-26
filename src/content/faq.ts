import { COUPON_RULES } from "@/lib/coupons";
import { site } from "@/lib/site";

/**
 * FAQ content. Answers are written ONLY from confirmed facts. Each answer cites its
 * source in the comment above it. Unknowns (turnaround, minimums, pricing, shipping)
 * are deliberately omitted — see the TODO(content) block at the bottom.
 */

export type FaqItem = {
  question: string;
  answer: string;
  /** Rendered as links after the answer (never put raw paths in answer text). */
  links?: readonly { label: string; href: string }[];
};

export const faq: readonly FaqItem[] = [
  {
    // Source: docs/00-PROJECT-BRIEF.md §1 (blanks) and owner answer 2026-11-23.
    question: "What do you print on?",
    answer: "Gildan is always stocked. We'll also print on garments you bring in or request — just ask.",
  },
  {
    // Source: old site's Custom Image Uploader (/custom-image-uploader.html): PNG or JPEG, max 20 MB;
    // old builder ("Design Your Own Shirt") recommends a PNG with transparency.
    question: "What artwork files work?",
    answer: "PNG or JPEG up to 20 MB. A transparent PNG looks best for designs placed on a garment.",
  },
  {
    // Source: COUPON_RULES (src/lib/coupons.ts) and docs/00-PROJECT-BRIEF.md §6 (coupon confirmed 2026-11-23).
    question: "How does the discount coupon work?",
    answer: `Use the mockup builder to email yourself a mockup and you'll get a code for ${COUPON_RULES.percentOff}% off your 2nd order. It expires after ${COUPON_RULES.expiryDays} days, one per email, with a $${COUPON_RULES.minOrderCents / 100} minimum order.`,
    links: [{ label: "Open the mockup builder", href: "/#design" }],
  },
  {
    // Source: docs/00-PROJECT-BRIEF.md §1 and src/lib/site.ts.
    question: "Where are you?",
    answer: "Port St. Lucie, Florida, serving the Treasure Coast.",
  },
  {
    // Source: src/content/services.ts (screen printing, DTF, embroidery, print & promo).
    question: "What printing methods do you offer?",
    answer: "Screen printing, DTF (direct-to-film), embroidery, and print & promo products.",
    links: [{ label: "Compare the methods", href: "/services" }],
  },
  {
    // Source: docs/01-CURRENT-SITE-INVENTORY.md (Design Your Own, Business & Promo) and site.ts email.
    question: "How do I order or get a quote?",
    answer: "Use the mockup builder, send us the quote form, or just email us.",
    links: [
      { label: "Mockup builder", href: "/#design" },
      { label: "Quote form", href: "/business#quote" },
      { label: site.email.toLowerCase(), href: `mailto:${site.email}` },
    ],
  },
] as const;

// TODO(content): the following questions are intentionally NOT rendered because the answers
// are unknown. Resolve Brief Q3 (pricing rules) and Q7 (turnaround, shipping vs pickup, MOQs)
// before adding them:
// - "What are your turnaround times?" (Brief Q7)
// - "Is there a minimum order quantity?" (Brief Q7)
// - "How much does a custom order cost?" (Brief Q3)
// - "Do you ship, or is it local pickup?" (Brief Q7)
// - "What are your hours?" (Brief Q1)
// - "What is your address / phone number?" (Brief Q1)
// - "What Gildan styles and colors are stocked?" (Brief Q4)
