import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Section } from "@/components/sections/section";
import { services } from "@/content/services";

/** Home #services: the services grid; each card links into the full /services page. */
export function ServicesSection() {
  return (
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
  );
}
