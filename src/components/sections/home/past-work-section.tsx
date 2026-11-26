import { Section } from "@/components/sections/section";
import { PortfolioGallery } from "@/components/sections/portfolio-gallery";
import { portfolio } from "@/content/portfolio";

/** Largest photos first — the tiny phone photos render at (or under) intrinsic size. */
const pastWork = [...portfolio].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 6);

/**
 * Home #past-work: the one past-work gallery on Home (a six-photo slice of the
 * portfolio; the full gallery lives on /business, so nothing repeats on one page).
 */
export function PastWorkSection() {
  return (
    <Section id="past-work" eyebrow="Past work" title="Real jobs from the shop" description="A few pieces we've made.">
      <PortfolioGallery items={pastWork} />
    </Section>
  );
}
