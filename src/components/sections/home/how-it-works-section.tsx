import { Section } from "@/components/sections/section";

const steps = [
  {
    number: "01",
    title: "Design or send your art",
    body: "Use the mockup builder, or upload artwork for an order you've already placed.",
  },
  {
    number: "02",
    title: "We print it in Port St. Lucie",
    body: "Screen print, DTF, or embroidery on the blank you choose.",
  },
  {
    number: "03",
    title: "We reach out to finalize and deliver",
    body: "We confirm the details and pricing with you before we print.",
  },
] as const;

/** Home #how-it-works: the three-step process strip. */
export function HowItWorksSection() {
  return (
    <Section id="how-it-works" eyebrow="Process" title="How it works">
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.number} className="border-border bg-bg-2/60 rounded-2xl border p-6">
            <span className="font-heading text-neon-cyan text-sm tracking-widest">{step.number}</span>
            <h3 className="font-heading text-text-1 mt-2 text-lg">{step.title}</h3>
            <p className="text-text-2 mt-2 text-sm">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
