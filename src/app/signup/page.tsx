import type { Metadata } from "next";
import { Suspense } from "react";

import { SignupForm } from "@/components/forms/signup-form";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { sanitizeNext } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

export default async function SignupPage(props: PageProps<"/signup">) {
  return (
    <Section>
      <div className="mx-auto w-full max-w-md">
        <PageHeader
          eyebrow="Join the pack"
          title="Create your account"
          description="Save mockups, send order requests, and keep every design in one kennel."
        />
        <div className="mt-8">
          <Suspense
            fallback={
              <p role="status" className="text-text-2 animate-pulse text-sm">
                Loading…
              </p>
            }
          >
            <SignupGate searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </Section>
  );
}

async function SignupGate({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const { next } = await searchParams;
  return <SignupForm next={sanitizeNext(next)} />;
}
