import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { VerifyForm } from "@/components/forms/verify-form";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";
import { sanitizeNext } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default async function VerifyPage(props: PageProps<"/verify">) {
  return (
    <Section>
      <div className="mx-auto w-full max-w-md">
        <PageHeader eyebrow="Almost there" title="Check your inbox" />
        <div className="mt-8">
          <Suspense
            fallback={
              <p role="status" className="text-text-2 animate-pulse text-sm">
                Loading…
              </p>
            }
          >
            <VerifyGate searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </Section>
  );
}

/** The session + redirect reads stream in behind the boundary; the page shell stays cacheable. */
async function VerifyGate({ searchParams }: { searchParams: PageProps<"/verify">["searchParams"] }) {
  const { next } = await searchParams;
  const safeNext = sanitizeNext(next);

  const user = await currentUser(getDb());
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNext)}`);
  if (user.emailVerifiedAt) redirect(safeNext);

  return <VerifyForm next={safeNext} email={user.email} />;
}
