import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AccountTabs } from "@/components/account/account-tabs";
import { LogoutButton } from "@/components/forms/logout-button";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";

export const metadata: Metadata = {
  title: "My designs",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <Section>
      <div className="mx-auto w-full max-w-6xl">
        <Suspense
          fallback={
            <p role="status" className="text-text-2 animate-pulse text-sm">
              Fetching your designs…
            </p>
          }
        >
          <AccountGate />
        </Suspense>
      </div>
    </Section>
  );
}

/** Session + redirects read at request time, streamed in behind the page's boundary. */
async function AccountGate() {
  const user = await currentUser(getDb());
  if (!user) redirect(`/login?next=${encodeURIComponent("/account")}`);
  if (!user.emailVerifiedAt) redirect("/verify");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="My account"
          title={user.name ? `Hey, ${user.name}` : "Your designs"}
          description="Everything you've saved in the builder, every order request, and your sign-in settings."
        />
        <LogoutButton />
      </div>
      <div className="mt-8">
        <AccountTabs email={user.email} />
      </div>
    </>
  );
}
