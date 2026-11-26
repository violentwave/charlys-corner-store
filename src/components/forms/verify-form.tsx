"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { verifyCodeSchema } from "@/lib/auth-schema";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { NETWORK_ERROR, postJson } from "./auth-post";

const RESEND_COOLDOWN_SECONDS = 30;

export interface VerifyFormProps {
  next: string;
  email: string;
  /** Inline mode (builder sign-in dialog): called instead of navigating. */
  onDone?: () => void;
}

export function VerifyForm({ next, email, onDone }: VerifyFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const {
    register,
    handleSubmit,
    setError: setErrorField,
    formState: { errors, isSubmitting },
  } = useForm<{ code: string }>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: { code: "" },
  });

  // "Send a new code" is disabled for 30s after a send.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const codeField = register("code");

  const onVerify = async ({ code }: { code: string }) => {
    setError(null);
    setResent(null);
    const { data: res } = await postJson("/api/auth/verify", { code });
    if (res?.ok) {
      if (onDone) {
        onDone();
        return;
      }
      router.refresh();
      router.replace(next);
      return;
    }
    if (res && !res.ok && res.fieldErrors?.code) {
      setErrorField("code", { message: res.fieldErrors.code });
    } else {
      setError(res && !res.ok ? res.error : NETWORK_ERROR);
    }
  };

  const onResend = async () => {
    setError(null);
    setResent(null);
    const { data: res } = await postJson("/api/auth/resend");
    if (res?.ok) {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setResent(`Fresh code sent to ${email}. Give it a minute, and peek in spam.`);
      return;
    }
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <form onSubmit={handleSubmit(onVerify)} className="flex flex-col gap-4" noValidate>
      <p className="text-text-2 text-sm" data-testid="verify-email-note">
        We emailed a 6-digit code to <span className="text-text-1 font-medium">{email}</span>. It lasts 15 minutes.
      </p>

      <Field label="Verification code" required error={errors.code?.message}>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="font-mono tracking-[0.4em] sm:w-44"
          data-testid="verify-code"
          {...codeField}
          onChange={(event) => {
            // Paste-friendly: swallow spaces and separators, keep the digits.
            event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
            void codeField.onChange(event);
          }}
        />
      </Field>

      <div>
        <Button type="submit" loading={isSubmitting}>
          Verify my email
        </Button>
      </div>

      <button
        type="button"
        onClick={onResend}
        disabled={cooldown > 0}
        data-testid="resend-code"
        className="text-neon-cyan focus-visible:ring-neon-cyan self-start rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
      </button>

      {resent ? (
        <p role="status" className="text-neon-green text-sm" data-testid="resent-note">
          {resent}
        </p>
      ) : null}
      {error ? <FormStatus status="error" message={error} /> : null}
    </form>
  );
}
