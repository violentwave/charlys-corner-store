"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { loginSchema, type AccountUser, type LoginInput } from "@/lib/auth-schema";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { mapFieldErrors, NETWORK_ERROR, postJson } from "./auth-post";

export interface LoginFormProps {
  next: string;
  /** Inline mode (builder sign-in dialog): called instead of navigating. */
  onDone?: (user: AccountUser) => void;
  /** Inline mode: shows "Create an account" as a button that switches the dialog's tab. */
  onSwitchToSignup?: () => void;
}

export function LoginForm({ next, onDone, onSwitchToSignup }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError: setErrorField,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginInput) => {
    setError(null);
    const { data: res } = await postJson("/api/auth/login", data);
    if (res?.ok) {
      const user = res.user as AccountUser | undefined;
      if (onDone && user) {
        onDone(user);
        return;
      }
      router.refresh();
      router.replace(user?.verified ? next : `/verify?next=${encodeURIComponent(next)}`);
      return;
    }
    mapFieldErrors(res ?? { ok: false, error: NETWORK_ERROR }, setErrorField);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field label="Email" required error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
      </Field>

      <Field label="Password" required error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...register("password")} invalid={!!errors.password} />
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
  );
}
