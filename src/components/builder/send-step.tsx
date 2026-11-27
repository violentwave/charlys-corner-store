"use client";
/**
 * Step 4: "Send it or order it" (docs/04 §5 v2 + §5b). Three clearly separate paths, each
 * its own card with one sentence and one button: email the mockup, order this one design,
 * or collect it in the cart to send several together. Notes for Charly's sit above the
 * cards (P48-2) and ride along with any path. Identity comes from the verified account —
 * the old email/name/phone/Turnstile gate is gone. The email path keeps the marketing
 * opt-in (unchecked by default); the order path carries the sizes/quantities grid and the
 * referral question (old-site parity).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { ReferralFields } from "@/components/forms/referral-fields";
import { NETWORK_ERROR, postJson } from "@/components/forms/auth-post";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { GarmentConfig } from "@/lib/garments";
import { referralSchema, type ReferralInput } from "@/lib/schemas";

import type { BuilderDesign } from "./use-builder-state";
import { SizeGrid } from "@/components/forms/size-grid";
import type { SizeSet } from "@/lib/size-sets";
import { combineSizesAndRoster, sizesTotal } from "@/lib/member-schemas";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** The last Add to cart attempt, shown inline under the cards (no success screen). */
export type CartAddState =
  | { kind: "added"; count: number; warning?: string }
  | { kind: "full"; message: string }
  | { kind: "error"; message: string };

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
  /** Honeypot value lives in the parent so every button submits it. */
  onWebsite: (website: string) => void;
  onSend: (intent: "email" | "order", marketingOptIn: boolean) => void;
  /** Collects this design in the cart (POST /api/cart, same body as the other paths). */
  onAddToCart: () => void;
  /** true when the design was opened from the cart (?cart=<id>): the button updates it. */
  cartEditing: boolean;
  /** Result of the last Add to cart attempt (success, full cart, or an error). */
  cartState: CartAddState | null;
  /** Starts a fresh design (the "Design another" link after adding to the cart). */
  onDesignAnother: () => void;
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
  onAddToCart,
  cartEditing,
  cartState,
  onDesignAnother,
}: SendStepProps) {
  const [optIn, setOptIn] = useState(false);
  const [needsQuantity, setNeedsQuantity] = useState(false);
  // Saved size sets (Member perks): "Use saved sizes" fills the grid; "Save these sizes"
  // stores the current grid under a name. Only for signed-in members.
  const [sizeSets, setSizeSets] = useState<SizeSet[] | null>(null);
  const [saveSizesOpen, setSaveSizesOpen] = useState(false);

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

  useEffect(() => {
    if (!accountEmail) return;
    let alive = true;
    fetch("/api/account/size-sets", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { sizeSets?: SizeSet[] } | null;
        if (alive && res.ok) setSizeSets(data?.sizeSets ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [accountEmail]);

  const applySizeSet = (id: string) => {
    const set = sizeSets?.find((s) => s.id === id);
    if (!set) return;
    for (const [size, qty] of Object.entries(combineSizesAndRoster(set.sizes, set.roster, garment.sizes))) {
      onSize(size, qty);
    }
  };

  const blocked = !hasArtwork;
  const send = (intent: "email" | "order" | "cart") => {
    if (blocked || sending) return;
    if (intent === "cart") {
      // Sizes are optional until the cart is sent — no quantity check on this path.
      setNeedsQuantity(false);
      onAddToCart();
      return;
    }
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Path 1: the free mockup. */}
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
            </span>
            . Pay for an order once and we&apos;ll email you 15% off your next one.
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

          {sizeSets && sizeSets.length > 0 ? (
            <Field label="Use saved sizes" hint="Fills the grid from a set you saved." controlId="use-sizes">
              <Select onValueChange={applySizeSet}>
                <SelectTrigger id="use-sizes" className="h-11 w-full" data-testid="use-saved-sizes">
                  <SelectValue placeholder="Pick a saved size set" />
                </SelectTrigger>
                <SelectContent>
                  {sizeSets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <SizeGrid
            sizes={garment.sizes}
            values={design.sizes}
            onChange={onSize}
            idPrefix="order"
            label="Sizes and quantities"
          />

          {accountEmail ? (
            <button
              type="button"
              onClick={() => setSaveSizesOpen(true)}
              data-testid="save-sizes"
              className="text-neon-cyan focus-visible:ring-neon-cyan self-start rounded-sm text-xs underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Save these sizes for next time
            </button>
          ) : null}

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

        {/* Path 3: collect designs and send them as one order (docs/04 §5b). */}
        <section
          aria-label="Add to cart"
          className="border-border bg-bg-2/60 flex flex-col gap-3 rounded-2xl border p-4 sm:p-5"
          data-testid="path-cart"
        >
          <span aria-hidden="true" className="text-2xl">
            🛒
          </span>
          <h3 className="font-heading text-text-1 text-base tracking-wide uppercase">Add to cart</h3>
          <p className="text-text-2 text-sm">
            Collect a few designs and send them together. One price for the whole order.
          </p>
          {cartEditing ? (
            <p className="text-text-3 text-xs" data-testid="cart-editing">
              Updating a design in your cart — the new version replaces the old one.
            </p>
          ) : null}
          <div className="mt-auto">
            <Button
              type="button"
              variant="secondary"
              onClick={() => send("cart")}
              disabled={blocked || sending}
              loading={sending}
              data-testid="send-cart"
              className="w-full"
            >
              {cartEditing ? "Update in cart" : "Add to cart"}
            </Button>
          </div>
        </section>
      </div>

      {cartState ? (
        <div
          role={cartState.kind === "added" ? "status" : "alert"}
          data-testid={cartState.kind === "added" ? "cart-added" : "cart-error"}
          className={
            cartState.kind === "added"
              ? "border-neon-cyan/50 bg-bg-2/60 flex flex-col gap-2 rounded-xl border p-4"
              : "border-danger/60 bg-bg-2/60 flex flex-col gap-2 rounded-xl border p-4"
          }
        >
          {cartState.kind === "added" ? (
            <>
              <p className="text-text-1 text-sm">
                Added to your cart ({cartState.count} {cartState.count === 1 ? "design" : "designs"}).
              </p>
              {cartState.warning ? (
                <p className="text-danger text-xs" role="alert">
                  {cartState.warning}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link href="/cart">View cart</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDesignAnother}
                  data-testid="cart-design-another"
                >
                  Design another
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-text-1 text-sm">{cartState.message}</p>
              <div>
                <Button asChild size="sm" variant="secondary">
                  <Link href="/cart">View cart</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <p className="text-text-3 text-xs" role="note">
        We only use your artwork to make your mockup and quote your order. Ask us anytime to delete it.
      </p>

      {saveSizesOpen ? (
        <SaveSizesDialog
          sizes={design.sizes}
          onClose={() => setSaveSizesOpen(false)}
          onSaved={() => {
            setSaveSizesOpen(false);
            // Re-read so "Use saved sizes" offers the new set right away.
            fetch("/api/account/size-sets", { cache: "no-store" })
              .then(async (res) => {
                const data = (await res.json().catch(() => null)) as { sizeSets?: SizeSet[] } | null;
                if (res.ok) setSizeSets(data?.sizeSets ?? []);
              })
              .catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}

/** "Save these sizes": a name, and the current grid becomes a saved set (zeros dropped). */
function SaveSizesDialog({
  sizes,
  onClose,
  onSaved,
}: {
  sizes: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const save = async () => {
    setError(null);
    setFieldError(undefined);
    setPending(true);
    const { data: res } = await postJson("/api/account/size-sets", {
      name: name.trim(),
      sizes: Object.fromEntries(Object.entries(sizes).filter(([, qty]) => qty > 0)),
      roster: [],
    });
    setPending(false);
    if (res?.ok) {
      toast({ title: "Sizes saved." });
      onSaved();
      return;
    }
    if (res && !res.ok && res.fieldErrors) setFieldError(Object.values(res.fieldErrors)[0] ?? undefined);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-describedby="save-sizes-body" data-testid="save-sizes-dialog">
        <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
          Save these sizes
        </DialogTitle>
        <DialogDescription id="save-sizes-body" className="text-text-2 text-sm">
          {sizesTotal(sizes)} pieces — you&apos;ll drop them straight into any order.
        </DialogDescription>
        <Field label="Name this size set" required error={fieldError ?? undefined} controlId="save-sizes-name">
          <Input
            id="save-sizes-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fall fundraiser 2027"
            data-testid="save-sizes-name"
          />
        </Field>
        {error ? (
          <p role="alert" className="text-danger text-sm" data-testid="save-sizes-error">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => void save()} loading={pending} data-testid="save-sizes-submit">
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
