import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/components/forms/login-form";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { sanitizeNext } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false, follow: false },
};

export default async function LoginPage(props: PageProps<"/login">) {
  return (
    <Section>
      <div className="mx-auto w-full max-w-md">
        <PageHeader
          eyebrow="Welcome back"
          title="Log in"
          description="Good to see you again. Your designs missed you."
        />
        <div className="mt-8">
          <Suspense
            fallback={
              <p role="status" className="text-text-2 animate-pulse text-sm">
                Loading…
              </p>
            }
          >
            <LoginGate searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </Section>
  );
}

async function LoginGate({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <LoginForm next={sanitizeNext(next)} />;
}
