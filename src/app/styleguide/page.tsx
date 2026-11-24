import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CouponTicket } from "@/components/neon/coupon-ticket";
import { Hero } from "@/components/neon/hero";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OverlaysDemo } from "./overlays-demo";
import { ReferralSurveyDemo } from "./referral-survey";

export const metadata: Metadata = {
  title: "Styleguide",
  robots: { index: false, follow: false },
};

export default function StyleguidePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-text-1 text-3xl tracking-widest uppercase">Styleguide</h1>
        <p className="text-text-2">Reference for base primitives. Not indexed by search engines.</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-text-1 text-xl tracking-widest uppercase">Button</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm">
            Primary sm
          </Button>
          <Button variant="primary" size="md">
            Primary md
          </Button>
          <Button variant="primary" size="lg">
            Primary lg
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm">
            Secondary sm
          </Button>
          <Button variant="secondary" size="md">
            Secondary md
          </Button>
          <Button variant="secondary" size="lg">
            Secondary lg
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm">
            Ghost sm
          </Button>
          <Button variant="ghost" size="md">
            Ghost md
          </Button>
          <Button variant="ghost" size="lg">
            Ghost lg
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button asChild>
            <Link href="/">asChild link</Link>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-text-1 text-xl tracking-widest uppercase">Card</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Static card</CardTitle>
            </CardHeader>
            <CardContent>Body content on a glass surface.</CardContent>
            <CardFooter>Footer row</CardFooter>
          </Card>
          <Card interactive>
            <CardHeader>
              <CardTitle>Interactive card</CardTitle>
            </CardHeader>
            <CardContent>Hover to see the pink+cyan glow.</CardContent>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-text-1 text-xl tracking-widest uppercase">Badge</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="pink">Pink</Badge>
          <Badge variant="cyan">Cyan</Badge>
          <Badge variant="yellow">Yellow (money)</Badge>
          <Badge variant="green">Green (success)</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-text-1 text-xl tracking-widest uppercase">Overlays</h2>
        <OverlaysDemo />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-text-1 text-xl tracking-widest uppercase">Signature</h2>
        <p className="text-text-3 text-xs">Sample coupon — not a real code.</p>
        <CouponTicket code="CHARLY-TEST-1234" expiresAt={new Date("2027-01-15T00:00:00Z")} />
        <Hero
          titleAs="h2"
          eyebrow="Phase 1 preview"
          title="Neon Coast"
          subtitle="A Miami Vice skyline for a Treasure Coast print shop."
          actions={
            <>
              <Button>Design Your Own</Button>
              <Button variant="secondary">Shop</Button>
            </>
          }
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-text-1 text-xl tracking-widest uppercase">Forms</h2>

        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Email" hint="We'll never share it." required>
            <Input type="email" placeholder="you@example.com" />
          </Field>
          <Field label="Email (filled)" required>
            <Input type="email" defaultValue="charly@example.com" />
          </Field>
          <Field label="Email (disabled)">
            <Input type="email" disabled defaultValue="disabled@example.com" />
          </Field>
          <Field label="Email (error)" error="Please enter a valid email.">
            <Input type="email" defaultValue="not-an-email" invalid />
          </Field>
        </div>

        <Field label="Message" hint="Tell us about your order.">
          <Textarea placeholder="Type your message…" rows={4} />
        </Field>
        <Field label="Message (error)" error="Message is required.">
          <Textarea defaultValue="Hi" invalid />
        </Field>

        <Field label="Garment" hint="Choose a product.">
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select a garment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tee">T-shirt</SelectItem>
              <SelectItem value="raglan">Baseball tee</SelectItem>
              <SelectItem value="hoodie">Hoodie</SelectItem>
              <SelectItem value="hat">Hat</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-center gap-3">
          <Checkbox id="styleguide-checkbox" />
          <label htmlFor="styleguide-checkbox" className="text-text-2 text-sm">
            I agree to the terms
          </label>
        </div>

        <div className="border-border bg-bg-2/60 rounded-2xl border p-4">
          <h3 className="font-heading text-text-1 mb-3 text-sm tracking-widest uppercase">
            Referral survey (legacy parity demo)
          </h3>
          <ReferralSurveyDemo />
        </div>
      </section>
    </div>
  );
}
