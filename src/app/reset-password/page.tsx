import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { PageHeader } from "@/components/sections/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { Section } from "@/components/sections/section";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <PageTransition>
      <Section>
        <div className="mx-auto w-full max-w-md">
          <PageHeader eyebrow="Password reset" title="Pick a new password" />
          <div className="mt-8">
            <Suspense
              fallback={
                <p role="status" className="text-text-2 animate-pulse text-sm">
                  Loading…
                </p>
              }
            >
              <ResetGate searchParams={props.searchParams} />
            </Suspense>
          </div>
        </div>
      </Section>
    </PageTransition>
  );
}

async function ResetGate({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : ""} />;
}
