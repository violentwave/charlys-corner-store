"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import type { Control, FieldErrors } from "react-hook-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormStatus } from "./form-status";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile } from "./turnstile";
import { ReferralFields } from "./referral-fields";
import { submitContact } from "@/app/actions/contact";
import { contactSchema, type ContactInput, type ReferralInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

export interface ContactFormProps {
  sourcePage: "about" | "contact";
}

export function ContactForm({ sourcePage }: ContactFormProps) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
      referralSource: undefined,
      referralOther: "",
    },
  });

  const onError = (errs: typeof errors) => {
    const first = Object.keys(errs)[0] as keyof ContactInput | undefined;
    if (first) {
      const el = document.querySelector<HTMLElement>(`[name="${first}"]`);
      el?.focus();
    }
  };

  const onSubmit = (data: ContactInput) => {
    startTransition(async () => {
      const website = (document.getElementById("website") as HTMLInputElement | null)?.value ?? "";
      let actionResult: ActionResult;
      try {
        actionResult = await submitContact({ ...data, website }, sourcePage, turnstileToken);
      } catch {
        actionResult = { ok: false, error: "Something went wrong. Please try again or email us." };
      }
      if (!actionResult.ok && actionResult.fieldErrors) {
        for (const [field, message] of Object.entries(actionResult.fieldErrors)) {
          setError(field as keyof ContactInput, { message });
        }
      }
      setResult(actionResult);
      if (actionResult.ok) reset();
      // Turnstile tokens are single-use: get a fresh one after EVERY attempt, or retries always fail.
      setTurnstileToken(null);
      setTurnstileKey((k) => k + 1);
    });
  };

  if (result?.ok) {
    return (
      <div className="border-border bg-bg-2/60 flex flex-col gap-4 rounded-2xl border p-6">
        <p className="font-heading text-neon-green text-lg uppercase">Thanks!</p>
        <p className="text-text-2">{result.message}</p>
        <button
          type="button"
          className="text-neon-cyan self-start text-sm underline-offset-4 hover:underline"
          onClick={() => setResult(null)}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onError)} className="flex flex-col gap-4" noValidate>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <Field label="Name" required error={errors.name?.message}>
        <Input {...register("name")} invalid={!!errors.name} />
      </Field>
      <Field label="Email" required error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register("email")} invalid={!!errors.email} />
      </Field>
      <Field label="Phone" hint="Optional." error={errors.phone?.message}>
        <Input type="tel" autoComplete="tel" {...register("phone")} invalid={!!errors.phone} />
      </Field>
      <Field label="Message" required error={errors.message?.message}>
        <Textarea rows={5} {...register("message")} invalid={!!errors.message} />
      </Field>
      <ReferralFields
        control={control as unknown as Control<ReferralInput>}
        errors={errors as FieldErrors<ReferralInput>}
      />

      <Turnstile onToken={setTurnstileToken} resetKey={turnstileKey} />

      <FormStatus status={result && !result.ok ? "error" : null} message={result && !result.ok ? result.error : null} />

      <div>
        <Button type="submit" loading={isPending}>
          Send message
        </Button>
      </div>
    </form>
  );
}
