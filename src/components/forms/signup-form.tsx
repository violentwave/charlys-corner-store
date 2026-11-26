"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { signupSchema, type AccountUser, type SignupInput } from "@/lib/auth-schema";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { Turnstile } from "./turnstile";
import { mapFieldErrors, NETWORK_ERROR, postJson } from "./auth-post";

export interface SignupFormProps {
  /** Where to go after verifying (page mode). */
  next: string;
  /** Inline mode (builder sign-in dialog): called instead of navigating to /verify. */
  onDone?: (user: AccountUser) => void;
  /** Inline mode: shows "Log in" as a button that switches the dialog's tab. */
  onSwitchToLogin?: () => void;
}

export function SignupForm({ next, onDone, onSwitchToLogin }: SignupFormProps) {
  const router = useRouter();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError: setErrorField,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", name: "" },
  });

  const onSubmit = async (data: SignupInput) => {
    setError(null);
    setConflict(false);
    const { status, data: res } = await postJson("/api/auth/signup", { ...data, turnstileToken });
    if (res?.ok) {
      if (onDone) onDone(res.user as AccountUser);
      else router.replace(`/verify?next=${encodeURIComponent(next)}`);
      return;
    }
    if (res && !res.ok && status === 409) {
      // "Already exists" is a whole-form situation, not a field fix: show it once, with a log-in link.
      setConflict(true);
      setError(res.error);
    } else {
      const fieldErrors = mapFieldErrors(res ?? { ok: false, error: NETWORK_ERROR }, setErrorField);
      setError(res && !res.ok ? res.error : (fieldErrors.email ?? NETWORK_ERROR));
    }
    // Tokens are single-use: get a fresh one after EVERY attempt, or retries always fail.
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field label="Email" required error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
      </Field>

      <Field
        label="Password"
        required
        hint="At least 10 characters."
        error={errors.password?.message}
        controlId="signup-password"
      >
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className="pr-16"
            {...register("password")}
            {...fieldControlProps("signup-password", {
              hint: "At least 10 characters.",
              error: errors.password?.message,
              required: true,
            })}
            invalid={!!errors.password}
          />
          <button
            type="button"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            className="text-neon-cyan focus-visible:ring-neon-cyan absolute top-1/2 right-2 -translate-y-1/2 rounded-sm px-2 py-1 text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      <Field label="Name" hint="Optional — we put it on your order requests." error={errors.name?.message}>
        <Input type="text" autoComplete="name" {...register("name")} invalid={!!errors.name} />
      </Field>

      <Turnstile onToken={setTurnstileToken} resetKey={turnstileKey} />

      {error ? (
        <div role="alert">
          <FormStatus status="error" message={error} />
          {conflict ? (
            <p className="text-text-2 mt-2 text-sm">
              Already have an account?{" "}
              {onSwitchToLogin ? (
                <button
                  type="button"
                  onClick={onSwitchToLogin}
                  className="text-neon-cyan focus-visible:ring-neon-cyan rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  Log in instead
                </button>
              ) : (
                <Link href="/login" className="text-neon-cyan underline-offset-4 hover:underline">
                  Log in instead
                </Link>
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button type="submit" loading={isSubmitting}>
          Create my account
        </Button>
      </div>

      <p className="text-text-2 text-sm">
        Already have an account?{" "}
        {onSwitchToLogin ? (
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-neon-cyan focus-visible:ring-neon-cyan rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Log in
          </button>
        ) : (
          <Link href="/login" className="text-neon-cyan underline-offset-4 hover:underline">
            Log in
          </Link>
        )}
      </p>
    </form>
  );
}
