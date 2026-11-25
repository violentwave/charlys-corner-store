"use client";
/**
 * Builder step 5: the email gate (docs/04 §5). Collects contact details, then the
 * parent builder renders the views and POSTs everything to /api/mockups.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { z } from "zod";

import { Turnstile } from "@/components/forms/turnstile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { emailField, phoneField } from "@/lib/schemas";

/** Contact fields of `mockupPayloadSchema`, for the gate form (name stays optional). */
export const gateContactSchema = z.object({
  email: emailField,
  name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: phoneField,
  marketingOptIn: z.boolean(),
  /** Honeypot: must stay empty (server returns a fake success when a bot fills it). */
  website: z.string(),
});
export type GateContactInput = z.infer<typeof gateContactSchema>;

export type GateContact = GateContactInput;

export interface GateStepProps {
  garmentName: string;
  /** false blocks submission with a clear message (payload requires artwork on ≥ 1 view). */
  hasArtwork: boolean;
  sending: boolean;
  /** Progress text shown while the request is in flight ("Rendering…", "Uploading…"). */
  progress: string;
  error: string | null;
  /** Server field errors (zodFieldErrors), mapped back onto the form fields. */
  fieldErrors: Record<string, string> | null;
  turnstileToken: string | null;
  onTurnstileToken: (token: string | null) => void;
  turnstileResetKey: number;
  /** Primary: "Get my mockup + 15% off". */
  onSubmit: (contact: GateContact) => Promise<void>;
  /** Secondary: "Send to Charly's for a quote" (same payload with wantsQuote: true). */
  onQuote: (contact: GateContact) => Promise<void>;
}

const FIELD_IDS = ["email", "name", "phone"] as const;

export function GateStep({
  garmentName,
  hasArtwork,
  sending,
  progress,
  error,
  fieldErrors,
  turnstileToken,
  onTurnstileToken,
  turnstileResetKey,
  onSubmit,
  onQuote,
}: GateStepProps) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<GateContactInput>({
    resolver: zodResolver(gateContactSchema) as unknown as Resolver<GateContactInput>,
    defaultValues: { email: "", name: "", phone: "", marketingOptIn: false, website: "" },
  });

  // Map server-side field errors back onto their fields.
  useEffect(() => {
    if (!fieldErrors) return;
    for (const id of FIELD_IDS) {
      if (fieldErrors[id]) setError(id, { message: fieldErrors[id] });
    }
  }, [fieldErrors, setError]);

  const submit = (mode: "mockup" | "quote") => (data: GateContactInput) => {
    void (mode === "quote" ? onQuote(data) : onSubmit(data));
  };

  const blocked = !hasArtwork;

  return (
    <form className="flex flex-col gap-4" data-testid="email-gate" noValidate onSubmit={handleSubmit(submit("mockup"))}>
      {/* Honeypot: bots fill it, humans never see it. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="builder-website">Website</label>
        <input id="builder-website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <h2 className="font-heading text-text-1 text-lg tracking-wide uppercase">Almost done</h2>
      <p className="text-text-2 text-sm">
        Enter your email and we&apos;ll send your {garmentName.toLowerCase()} mockup{" "}
        <strong className="text-text-1">plus 15% off your 2nd order</strong>.
      </p>

      <Field label="Email" required error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          data-testid="gate-email"
          {...register("email")}
          invalid={!!errors.email}
        />
      </Field>
      <Field label="Name" hint="Optional." error={errors.name?.message}>
        <Input autoComplete="name" data-testid="gate-name" {...register("name")} invalid={!!errors.name} />
      </Field>
      <Field label="Phone" hint="Optional." error={errors.phone?.message}>
        <Input type="tel" autoComplete="tel" data-testid="gate-phone" {...register("phone")} invalid={!!errors.phone} />
      </Field>

      <div className="flex items-start gap-3 text-sm">
        <Controller
          control={control}
          name="marketingOptIn"
          render={({ field }) => (
            <Checkbox
              id="gate-optin"
              data-testid="gate-optin"
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <label htmlFor="gate-optin" className="text-text-2">
          Email me occasional deals and updates from Charly&apos;s.
        </label>
      </div>

      <Turnstile onToken={onTurnstileToken} resetKey={turnstileResetKey} />

      <p className="text-text-3 text-xs" role="note">
        We only use your artwork to make your mockup and quote your order. Ask us anytime to delete it.
      </p>

      {blocked ? (
        <p className="text-danger text-sm" role="alert" data-testid="gate-blocked">
          Add your design first — go back to step 3 and place your artwork on at least one side.
        </p>
      ) : null}
      {progress ? (
        <p className="text-neon-cyan text-sm" role="status" data-testid="gate-progress">
          {progress}
        </p>
      ) : null}
      {error ? (
        <p className="text-danger text-sm" role="alert" data-testid="gate-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          disabled={blocked || sending || !turnstileToken}
          loading={sending}
          data-testid="gate-submit"
        >
          Get my mockup + 15% off
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={blocked || sending || !turnstileToken}
          onClick={() => {
            void handleSubmit(submit("quote"))();
          }}
          data-testid="gate-quote"
        >
          Send to Charly&apos;s for a quote
        </Button>
      </div>
      {!turnstileToken && !blocked ? (
        <p className="text-text-3 text-xs">Complete the anti-spam check above to enable the buttons.</p>
      ) : null}
    </form>
  );
}
