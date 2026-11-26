"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { loginSchema, type AccountUser, type LoginInput, type TwoFactorPending } from "@/lib/auth-schema";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormStatus } from "./form-status";
import { GoogleButton } from "./google-button";
import { Input } from "@/components/ui/input";
import { TwoFactorForm } from "./two-factor-form";
import { mapFieldErrors, NETWORK_ERROR, postJson } from "./auth-post";

export interface LoginFormProps {
  next: string;
  /** Inline mode (builder sign-in dialog): called instead of navigating. */
  onDone?: (user: AccountUser) => void;
  /**
   * Inline mode: 2FA is on and the password checked out — the dialog switches to the code
   * step (it renders its own TwoFactorForm so the dialog's title/blurb follow along).
   */
  onTwoFactor?: (challenge: TwoFactorPending) => void;
  /** Inline mode: shows "Create an account" as a button that switches the dialog's tab. */
  onSwitchToSignup?: () => void;
  /** Inline mode: where the Google handoff goes back to ("/#design" — the builder). */
  googleNext?: string;
  /** /login?error=google|google_cancelled|google_unavailable|too_many — friendly copy. */
  initialError?: string | null;
  /** /login?step=2fa (Google handoff): open straight on the code step. */
  initialStep?: "password" | "2fa";
}

export function LoginForm({
  next,
  onDone,
  onTwoFactor,
  onSwitchToSignup,
  googleNext,
  initialError = null,
  initialStep = "password",
}: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError);
  const [step, setStep] = useState<"password" | "twofactor">(initialStep === "2fa" ? "twofactor" : "password");
  const [challenge, setChallenge] = useState<TwoFactorPending | null>(null);

  // /login?step=2fa (after Google): ask the server what's pending in this browser.
  useEffect(() => {
    if (initialStep !== "2fa") return;
    let alive = true;
    fetch("/api/auth/2fa/verify", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { pending?: { method: "totp" | "email" | null } } | null;
        if (!alive) return;
        if (data?.pending?.method) {
          setChallenge({ method: data.pending.method, emailSent: data.pending.method === "email" });
          setStep("twofactor");
        } else {
          // No pending challenge: the sign-in timed out — back to the normal form.
          setStep("password");
          setError("Your sign-in timed out. Please sign in again.");
        }
      })
      .catch(() => {
        if (!alive) return;
        setStep("password");
        setError("Your sign-in timed out. Please sign in again.");
      });
    return () => {
      alive = false;
    };
  }, [initialStep]);

  const {
    register,
    handleSubmit,
    setError: setErrorField,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  /** What a fully signed-in member does next (page: navigate; dialog: hand back). */
  const finish = (user: AccountUser) => {
    if (onDone) {
      onDone(user);
      return;
    }
    router.refresh();
    router.replace(user?.verified ? next : `/verify?next=${encodeURIComponent(next)}`);
  };

  const onSubmit = async (data: LoginInput) => {
    setError(null);
    const { data: res } = await postJson("/api/auth/login", data);
    if (res?.ok) {
      if (res.twoFactor) {
        // 2FA is on: no session yet — the code step comes next (same form).
        const pending = res.twoFactor as TwoFactorPending;
        if (onTwoFactor) {
          onTwoFactor(pending);
          return;
        }
        setChallenge(pending);
        setStep("twofactor");
        return;
      }
      const user = res.user as AccountUser | undefined;
      if (user) finish(user);
      return;
    }
    mapFieldErrors(res ?? { ok: false, error: NETWORK_ERROR }, setErrorField);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  if (step === "twofactor" && challenge) {
    return (
      <div className="flex flex-col gap-4" data-testid="login-twofactor">
        <TwoFactorForm
          challenge={challenge}
          next={next}
          onDone={onDone ? finish : undefined}
          onBack={() => setStep("password")}
        />
      </div>
    );
  }

  // /login?step=2fa but the challenge expired: show the timeout note above the form.
  const timedOut = initialStep === "2fa" && step === "password" && error?.includes("timed out");

  return (
    <div className="flex flex-col gap-4" data-testid={timedOut ? "login-timed-out" : "login-password"}>
      <GoogleButton next={googleNext ?? next} />
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
        </Field>

        <Field label="Password" required error={errors.password?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            {...register("password")}
            invalid={!!errors.password}
          />
        </Field>

        <Link href="/forgot-password" className="text-neon-cyan self-start text-sm underline-offset-4 hover:underline">
          Forgot password?
        </Link>

        {error ? <FormStatus status="error" message={error} /> : null}

        <div>
          <Button type="submit" loading={isSubmitting}>
            Log in
          </Button>
        </div>

        <p className="text-text-2 text-sm">
          New here?{" "}
          {onSwitchToSignup ? (
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-neon-cyan focus-visible:ring-neon-cyan rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Create an account
            </button>
          ) : (
            <Link
              href={next === "/account" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`}
              className="text-neon-cyan underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          )}
        </p>
      </form>
    </div>
  );
}
