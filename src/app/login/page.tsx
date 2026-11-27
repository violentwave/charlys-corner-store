import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/components/forms/login-form";
import { PageHeader } from "@/components/sections/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { Section } from "@/components/sections/section";
import { sanitizeNext } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false, follow: false },
};

/** Friendly copy for the Google flow's failure modes (+ rate limits) — never scary, never blamey. */
const ERRORS: Record<string, string> = {
  google: "We couldn't finish Google sign-in. Please try again.",
  google_cancelled: "Google sign-in was cancelled. You can try again, or use your email and password.",
  google_unavailable: "Google sign-in isn't available right now. Use your email and password instead.",
  too_many: "Too many attempts. Please wait a few minutes and try again.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  return (
    <PageTransition>
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
    </PageTransition>
  );
}

async function LoginGate({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next, error, step } = await searchParams;
  return (
    <LoginForm
      next={sanitizeNext(next)}
      initialError={error && typeof error === "string" ? (ERRORS[error] ?? null) : null}
      initialStep={step === "2fa" ? "2fa" : "password"}
    />
  );
}
