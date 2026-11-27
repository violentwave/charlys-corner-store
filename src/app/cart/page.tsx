import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CartView } from "@/components/cart/cart-view";
import { PageTransition } from "@/components/layout/page-transition";
import { StudioHero } from "@/components/builder/studio-hero";
import { Section } from "@/components/sections/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <PageTransition>
      <StudioHero
        eyebrow="One order, one price"
        title="Your cart"
        subtitle="Collect designs here, add sizes, then send the whole lot at once. We'll check everything and email you one price."
        uploadLink={false}
      />
      <Section className="pt-8 sm:pt-10">
        <div className="mx-auto w-full max-w-6xl">
          <Suspense
            fallback={
              <p role="status" className="text-text-2 animate-pulse text-sm">
                Fetching your cart…
              </p>
            }
          >
            <CartGate />
          </Suspense>
        </div>
      </Section>
    </PageTransition>
  );
}

/** Session read at request time, streamed in behind the page's boundary. */
async function CartGate() {
  const user = await currentUser(getDb());
  if (!user) return <CartSignedOut />;
  return <CartView />;
}

function CartSignedOut() {
  return (
    <Card className="flex flex-col items-start gap-4" data-testid="cart-signed-out">
      <p className="font-heading text-text-1 text-lg tracking-wide uppercase">Log in to see your cart</p>
      <p className="text-text-2 text-sm">
        Your designs wait here until you&apos;re ready to send them together. One price for the whole order.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/login?next=%2Fcart">Log in</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/signup?next=%2Fcart">Sign up</Link>
        </Button>
      </div>
    </Card>
  );
}
