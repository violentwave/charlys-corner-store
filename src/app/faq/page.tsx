import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { faq } from "@/content/faq";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description: `Frequently asked questions about custom printing at ${site.name} in ${site.city}, ${site.region}.`,
};

export default function FaqPage() {
  return (
    <Section>
      <PageHeader
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="Straight answers. If something's missing, email us."
      />
      <div className="mt-8 flex flex-col gap-3">
        {faq.map((item) => (
          <details key={item.question} className="group border-border bg-bg-2/60 open:bg-bg-2/80 rounded-xl border p-4">
            <summary className="font-heading text-text-1 focus-visible:ring-neon-cyan focus-visible:ring-offset-bg-0 flex cursor-pointer list-none items-center justify-between gap-4 text-sm tracking-wide uppercase focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              {item.question}
              <span aria-hidden="true" className="text-neon-cyan transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="text-text-2 mt-3">{item.answer}</p>
            {item.links ? (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {item.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-neon-cyan text-sm underline underline-offset-4">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        ))}
      </div>
    </Section>
  );
}
