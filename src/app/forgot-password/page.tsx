import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { PageHeader } from "@/components/sections/page-header";
import { Section } from "@/components/sections/section";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <Section>
      <div className="mx-auto w-full max-w-md">
        <PageHeader
          eyebrow="Password reset"
          title="Forgot password"
          description="Happens to the best of us. We'll email you a link to set a new one."
        />
        <div className="mt-8">
          <ForgotPasswordForm />
        </div>
      </div>
    </Section>
  );
}
