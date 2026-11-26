"use client";
/**
 * Step 4: "Send it or order it" (docs/04 §5 v2). Two clearly separate paths, each its own
 * card with one sentence and one button. Notes for Charly's sit above both cards (P48-2)
 * and ride along with either path. Identity comes from the verified account — the old
 * email/name/phone/Turnstile gate is gone. The email path keeps the marketing opt-in
 * (unchecked by default); the order path carries the sizes/quantities grid and the
 * referral question (old-site parity).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { ReferralFields } from "@/components/forms/referral-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GarmentConfig } from "@/lib/garments";
import { referralSchema, type ReferralInput } from "@/lib/schemas";

import type { BuilderDesign } from "./use-builder-state";

export interface SendStepProps {
  garment: GarmentConfig;
  design: BuilderDesign;
  /** The verified account's email — used for both paths and shown in the email card. */
  accountEmail: string | null;
  /** false blocks both buttons with a clear message (the payload needs artwork on ≥ 1 view). */
  hasArtwork: boolean;
  sending: boolean;
  /** Progress text shown while the request is in flight ("Rendering…", "Uploading…"). */
  progress: string | null;
  error: string | null;
  onSize: (size: string, qty: number) => void;
  onNotes: (notes: string) => void;
  onReferral: (referral: ReferralInput) => void;
  /** Honeypot value lives in the parent so both buttons submit it. */
  onWebsite: (website: string) => void;
  onSend: (intent: "email" | "order", marketingOptIn: boolean) => void;
}

/** Sizes/quantities must total at least 1 for an order (matches the server's rule). */
export function orderQuantity(design: BuilderDesign): number {
  return Object.values(design.sizes).reduce((sum, qty) => sum + qty, 0);
}

export function SendStep({
  garment,
  design,
  accountEmail,
  hasArtwork,
  sending,
  progress,
  error,
  onSize,
  onNotes,
  onReferral,
  onWebsite,
  onSend,
}: SendStepProps) {
  const [optIn, setOptIn] = useState(false);
  const [needsQuantity, setNeedsQuantity] = useState(false);

  const referralForm = useForm<ReferralInput>({
    resolver: zodResolver(referralSchema) as unknown as Resolver<ReferralInput>,
    defaultValues: design.referral,
  });

  // Keep the reducer in sync as the visitor answers (referral is optional).
  useEffect(() => {
    const sub = referralForm.watch((values) => {
      onReferral({
        referralSource: values.referralSource || undefined,
        referralOther: values.referralOther || undefined,
      });
    });
    return () => sub.unsubscribe();
  }, [referralForm, onReferral]);

  const blocked = !hasArtwork;
  const send = (intent: "email" | "order") => {
    if (blocked || sending) return;
    if (intent === "order" && orderQuantity(design) < 1) {
      setNeedsQuantity(true);
      return;
    }
    setNeedsQuantity(false);
    onSend(intent, optIn);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="send-step">
      {/* Honeypot: bots fill it, humans never see it. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="builder-website">Website</label>
        <input
          id="builder-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
          onChange={(e) => onWebsite(e.target.value)}
        />
      </div>

      {blocked ? (
        <p className="text-danger text-sm" role="alert" data-testid="send-blocked">
          Add your design first — go back to step 3 and place your artwork on at least one side.
        </p>
      ) : null}
      {progress ? (
        <p className="text-neon-cyan text-sm" role="status" data-testid="send-progress">
          {progress}
        </p>
      ) : null}
      {error ? (
        <p className="text-danger text-sm" role="alert" data-testid="send-error">
          {error}
        </p>
      ) : null}

      {/* Notes: one field above both cards (P48-2) — it rides along with whichever path
          you take. Same `design.notes` field and payload as before; the server sends it
          to the owner only. */}
      <Field
        label="Notes for Charly's"
        hint={`Optional — ${design.notes.length}/2000. Anything we should know? Different brand, your own garment, placement details…`}
        controlId="builder-notes"
      >
        <Textarea
          name="builder-notes"
          value={design.notes}
          maxLength={2000}
          rows={3}
          onChange={(e) => onNotes(e.target.value)}
          data-testid="builder-notes"
          {...fieldControlProps("builder-notes", {
            hint: `Optional — ${design.notes.length}/2000. Anything we should know? Different brand, your own garment, placement details…`,
          })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Path 1: the free mockup + coupon. */}
        <section
          aria-label="Email me this mockup"
          className="border-border bg-bg-2/60 flex flex-col gap-3 rounded-2xl border p-4 sm:p-5"
          data-testid="path-email"
        >
          <span aria-hidden="true" className="text-2xl">
            ✉️
          </span>
          <h3 className="font-heading text-text-1 text-base tracking-wide uppercase">Email me this mockup</h3>
          <p className="text-text-2 text-sm">
            We&apos;ll email your mockup to{" "}
            <span className="text-text-1 font-medium [overflow-wrap:anywhere]">
              {accountEmail ?? "your account email"}
            </span>{" "}
            plus 15% off your 2nd order.
          </p>
          <div className="flex items-start gap-3 text-sm">
            <Checkbox
              id="send-optin"
              data-testid="send-optin"
              className="mt-0.5"
              checked={optIn}
              onCheckedChange={(checked) => setOptIn(checked === true)}
            />
            <label htmlFor="send-optin" className="text-text-2">
              Email me occasional deals and updates from Charly&apos;s.
            </label>
          </div>
          <div className="mt-auto">
            <Button
              type="button"
              onClick={() => send("email")}
              disabled={blocked || sending}
              loading={sending}
              data-testid="send-email"
              className="w-full"
            >
              Email me my mockup
            </Button>
          </div>
        </section>

        {/* Path 2: the order request (sizes/quantities; price confirmed later). */}
        <section
          aria-label="Order this design"
          className="border-border bg-bg-2/60 flex flex-col gap-3 rounded-2xl border p-4 sm:p-5"
          data-testid="path-order"
        >
          <span aria-hidden="true" className="text-2xl">
            🧾
          </span>
          <h3 className="font-heading text-text-1 text-base tracking-wide uppercase">Order this design</h3>
          <p className="text-text-2 text-sm">
            Tell us sizes and quantities. We&apos;ll confirm the price and send you an invoice. Nothing is charged now.
          </p>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-text-1 text-sm font-medium">Sizes and quantities</legend>
            <div className="grid grid-cols-3 gap-2">
              {garment.sizes.map((size) => (
                <Field key={size} label={size} controlId={`size-${size}`} className="gap-1">
                  <Input
                    id={`size-${size}`}
                    name={`size-${size}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10000}
                    step={1}
                    value={design.sizes[size] ?? 0}
                    onChange={(e) => onSize(size, Number(e.target.value))}
                    className="h-11 w-full text-sm"
                  />
                </Field>
              ))}
            </div>
          </fieldset>

          <ReferralFields control={referralForm.control} />

          {needsQuantity ? (
            <p className="text-danger text-sm" role="alert" data-testid="order-needs-quantity">
              Add at least one size and quantity to order.
            </p>
          ) : null}
          <div className="mt-auto">
            <Button
              type="button"
              variant="secondary"
              onClick={() => send("order")}
              disabled={blocked || sending}
              loading={sending}
              data-testid="send-order"
              className="w-full"
            >
              Send order request
            </Button>
          </div>
        </section>
      </div>

      <p className="text-text-3 text-xs" role="note">
        We only use your artwork to make your mockup and quote your order. Ask us anytime to delete it.
      </p>
    </div>
  );
}
