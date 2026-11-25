"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { forgotPasswordSchema } from "@/lib/auth-schema";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { Turnstile } from "./turnstile";
import { mapFieldErrors, NETWORK_ERROR, postJson } from "./auth-post";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError: setErrorField,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: { email: string }) => {
    setError(null);
    setSentMessage(null);
    const { data: res } = await postJson("/api/auth/forgot", { ...data, turnstileToken });
    if (res?.ok) {
      // Neutral on purpose: never reveal whether the address has an account.
      setSentMessage(res.message as string);
      return;
    }
    mapFieldErrors(res ?? { ok: false, error: NETWORK_ERROR }, setErrorField);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
  };

  if (sentMessage) {
    return (
      <div className="flex flex-col gap-4">
        <FormStatus status="success" message={sentMessage} />
        <p className="text-text-2 text-sm">
          Follow the link in the email to pick a new password.{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-neon-cyan focus-visible:ring-neon-cyan rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Back to log in
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field label="Email" required error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
      </Field>

      <Turnstile onToken={setTurnstileToken} resetKey={turnstileKey} />

      {error ? <FormStatus status="error" message={error} /> : null}

      <div>
        <Button type="submit" loading={isSubmitting}>
          Email me a reset link
        </Button>
      </div>

      <p className="text-text-2 text-sm">
        Remembered it after all?{" "}
        <Link href="/login" className="text-neon-cyan underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
