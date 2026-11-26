import type { Metadata } from "next";
import { Suspense } from "react";

import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  return (
    <Section>
      <div className="mx-auto w-full max-w-md">
        <PageHeader
          eyebrow="Password reset"
          title="Forgot password"
          description="Happens to the best of us. We'll email you a link to set a new one."
        />
        <div className="mt-8">
          <Suspense
            fallback={
              <p role="status" className="text-text-2 animate-pulse text-sm">
                Loading…
              </p>
            }
          >
            <ForgotGate searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </Section>
  );
}

/** ?email= prefills the field (the Security tab's "Set a password" links here). */
async function ForgotGate({ searchParams }: { searchParams: PageProps<"/forgot-password">["searchParams"] }) {
  const { email } = await searchParams;
  return <ForgotPasswordForm defaultEmail={typeof email === "string" ? email : undefined} />;
}
