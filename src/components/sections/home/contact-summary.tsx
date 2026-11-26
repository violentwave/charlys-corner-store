import Link from "next/link";

import { Section } from "@/components/sections/section";
import { ContactDetails } from "@/components/sections/contact-details";
import { ContactForm } from "@/components/forms/contact-form";
import { ReferralSurvey } from "@/components/forms/referral-survey";

/**
 * Home #contact: contact details, the one contact form (sourcePage "contact"), and the
 * "How did you hear about us?" survey — ending in a link to the full /contact page.
 */
export function ContactSummary() {
  return (
    <Section id="contact" eyebrow="Get in touch" title="Contact">
      <div className="flex flex-col gap-12">
        <div className="grid gap-8 md:grid-cols-2">
          <ContactDetails className="max-w-xl" />
          <div className="max-w-xl">
            <ContactForm sourcePage="contact" />
          </div>
        </div>

        <div data-testid="survey" className="border-t border-dashed pt-8">
          <h3 className="font-heading text-text-1 text-lg tracking-wide uppercase sm:text-xl">
            How did you hear about us?
          </h3>
          <p className="text-text-2 mt-2 text-sm">It helps a small shop know what&apos;s working.</p>
          <div className="mt-6 max-w-xl">
            <ReferralSurvey />
          </div>
        </div>

        <Link href="/contact" className="text-neon-cyan text-sm underline-offset-4 hover:underline">
          More ways to reach us →
        </Link>
      </div>
    </Section>
  );
}
