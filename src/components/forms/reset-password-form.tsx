"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PASSWORD_MIN, resetPasswordSchema } from "@/lib/auth-schema";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { mapFieldErrors, NETWORK_ERROR, postJson } from "./auth-post";

/** Same rules as the shared schema, plus the client-side confirm field. */
const formSchema = resetPasswordSchema
  .omit({ token: true })
  .extend({ confirm: z.string().min(1, "Confirm your new password") })
  .refine((data) => data.confirm === data.password, {
    message: "The passwords don't match",
    path: ["confirm"],
  });

type ResetFormInput = z.infer<typeof formSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError: setErrorField,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = async (data: ResetFormInput) => {
    setError(null);
    const { data: res } = await postJson("/api/auth/reset", { token, password: data.password });
    if (res?.ok) {
      router.refresh();
      router.replace("/account");
      return;
    }
    const fieldErrors = mapFieldErrors(res ?? { ok: false, error: NETWORK_ERROR }, setErrorField);
    // A rejected token ("not valid" / "expired") has no rendered field — surface it in the alert.
    setError(res && !res.ok ? (fieldErrors.token ?? res.error) : NETWORK_ERROR);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field
        label="New password"
        required
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={errors.password?.message}
        controlId="reset-password"
      >
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className="pr-16"
            {...register("password")}
            {...fieldControlProps("reset-password", {
              hint: `At least ${PASSWORD_MIN} characters.`,
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

      <Field label="Confirm new password" required error={errors.confirm?.message}>
        <Input
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          {...register("confirm")}
          invalid={!!errors.confirm}
        />
      </Field>

      {error ? (
        <div role="alert">
          <FormStatus status="error" message={error} />
          <p className="text-text-2 mt-2 text-sm">
            Link trouble happens.{" "}
            <Link href="/forgot-password" className="text-neon-cyan underline-offset-4 hover:underline">
              Request a fresh reset link
            </Link>
          </p>
        </div>
      ) : null}

      <div>
        <Button type="submit" loading={isSubmitting}>
          Save my new password
        </Button>
      </div>
    </form>
  );
}
