"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "./form-status";
import { ReferralFields } from "./referral-fields";
import { Turnstile } from "./turnstile";
import { submitSurvey } from "@/app/actions/survey";
import { referralSchema, type ReferralInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

export function ReferralSurvey() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ReferralInput>({
    resolver: zodResolver(referralSchema),
    defaultValues: { referralSource: undefined, referralOther: "" },
  });

  const onSubmit = (data: ReferralInput) => {
    startTransition(async () => {
      const website = (document.getElementById("survey-website") as HTMLInputElement | null)?.value ?? "";
      let actionResult: ActionResult;
      try {
        actionResult = await submitSurvey({ ...data, website }, turnstileToken);
      } catch {
        actionResult = { ok: false, error: "Something went wrong. Please try again." };
      }
      if (!actionResult.ok && actionResult.fieldErrors) {
        for (const [field, message] of Object.entries(actionResult.fieldErrors)) {
          setError(field as keyof ReferralInput, { message });
        }
      }
      setResult(actionResult);
      if (actionResult.ok) reset();
      // Turnstile tokens are single-use: refresh after every attempt.
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="hidden" aria-hidden="true">
        <input id="survey-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <ReferralFields control={control} errors={errors} />

      <Turnstile onToken={setTurnstileToken} resetKey={turnstileKey} />

      <FormStatus status={result && !result.ok ? "error" : null} message={result && !result.ok ? result.error : null} />

      <div>
        <Button type="submit" loading={isPending}>
          Submit
        </Button>
      </div>
    </form>
  );
}
