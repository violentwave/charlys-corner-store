"use client";
/**
 * Second step of sign-in (docs/02 Members v2): the code from the authenticator app or a
 * freshly emailed 6-digit code — or a one-time backup code (XXXX-XXXX). Shown in the login
 * form, the password-reset form and the builder's sign-in dialog, after the first factor
 * (password, Google, or a reset link) answered `{ ok: true, twoFactor }`.
 *
 * On success the session starts (the server sets the cookie): fire `charly:auth-changed`
 * so the header flips without a navigation, toast when a backup code ran low, then finish
 * (inline `onDone`, or refresh + go to `next`).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { twoFactorVerifySchema, type AccountUser, type TwoFactorPending } from "@/lib/auth-schema";
import { AUTH_CHANGED_EVENT } from "@/components/layout/session";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { NETWORK_ERROR, postJson } from "./auth-post";

const RESEND_COOLDOWN_SECONDS = 30;

export interface TwoFactorFormProps {
  challenge: TwoFactorPending;
  next: string;
  /** Inline mode (builder sign-in dialog): called instead of navigating. */
  onDone?: (user: AccountUser) => void;
  /** Dialog mode only: back to the password form. */
  onBack?: () => void;
}

export function TwoFactorForm({ challenge, next, onDone, onBack }: TwoFactorFormProps) {
  const router = useRouter();
  const [backupMode, setBackupMode] = useState(false);
  const [resent, setResent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const {
    register,
    handleSubmit,
    setError: setErrorField,
    formState: { errors, isSubmitting },
  } = useForm<{ code: string }>({
    resolver: zodResolver(twoFactorVerifySchema),
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
    const parsed = twoFactorVerifySchema.safeParse({ code });
    if (!parsed.success) {
      setErrorField("code", { message: parsed.error.issues[0]?.message ?? "Enter your code" });
      return;
    }
    setError(null);
    setResent(null);
    const { data: res } = await postJson("/api/auth/2fa/verify", parsed.data);
    if (res?.ok) {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      const user = res.user as AccountUser;
      if (res.usedBackupCode && typeof res.backupCodesLeft === "number" && res.backupCodesLeft <= 3) {
        toast({
          title: "Backup code used",
          description: `${res.backupCodesLeft} left. Make new backup codes in Security.`,
          variant: "default",
        });
      }
      if (onDone) {
        onDone(user);
        return;
      }
      router.refresh();
      router.replace(user.verified ? next : `/verify?next=${encodeURIComponent(next)}`);
      return;
    }
    if (res && !res.ok && res.fieldErrors?.code) setErrorField("code", { message: res.fieldErrors.code });
    else setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  const onResend = async () => {
    setError(null);
    setResent(null);
    const { data: res } = await postJson("/api/auth/2fa/resend");
    if (res?.ok) {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setResent("Fresh code sent. Give it a minute, and peek in spam.");
      return;
    }
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <form onSubmit={handleSubmit(onVerify)} className="flex flex-col gap-4" noValidate>
      <p className="text-text-2 text-sm" data-testid="twofactor-note">
        {challenge.method === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : challenge.emailSent
            ? "We emailed you a 6-digit code."
            : "Enter the 6-digit code we emailed you."}
      </p>

      <Field label={backupMode ? "Backup code" : "6-digit code"} required error={errors.code?.message}>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={backupMode ? 9 : 6}
          placeholder={backupMode ? "XXXX-XXXX" : "123456"}
          className="font-mono tracking-[0.3em] sm:w-48"
          data-testid="twofactor-code"
          {...codeField}
          onChange={(event) => {
            if (backupMode) {
              // Backup codes are XXXX-XXXX: tolerate pasted variants, keep X and dashes.
              event.target.value = event.target.value
                .toUpperCase()
                .replace(/[^A-Z2-9-]/g, "")
                .slice(0, 9);
            } else {
              // Paste-friendly: swallow spaces and separators, keep the digits.
              event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
            }
            void codeField.onChange(event);
          }}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={isSubmitting}>
          Verify
        </Button>
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} data-testid="twofactor-back">
            ← Back
          </Button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          setBackupMode((v) => !v);
          setError(null);
          setResent(null);
        }}
        data-testid="twofactor-backup-toggle"
        aria-pressed={backupMode}
        className="text-neon-cyan focus-visible:ring-neon-cyan self-start rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        {backupMode ? "Use a 6-digit code instead" : "Use a backup code"}
      </button>

      {challenge.method === "email" && challenge.emailSent ? (
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0}
          data-testid="twofactor-resend"
          className="text-neon-cyan focus-visible:ring-neon-cyan self-start rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
        </button>
      ) : null}

      {resent ? (
        <p role="status" className="text-neon-green text-sm" data-testid="twofactor-resent">
          {resent}
        </p>
      ) : null}
      {error ? <FormStatus status="error" message={error} /> : null}
    </form>
  );
}
