"use client";
/**
 * One design in the cart (docs/04 §5b): every side's preview, the garment and colors, a
 * sizes grid built from the garment's own size list, and notes. Sizes and notes save
 * themselves (PATCH on blur, or 600 ms after the last keystroke) and the server's returned
 * item is the truth — the summary never guesses totals.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { SizeGrid } from "@/components/forms/size-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { CartItemView } from "@/lib/cart";
import { cn } from "@/lib/cn";

const piecesOf = (sizes: Record<string, number>) => Object.values(sizes).reduce((n, qty) => n + (qty > 0 ? qty : 0), 0);

/** The wire format drops zero rows; sending them back keeps the payload honest. */
const withoutZeros = (sizes: Record<string, number>) =>
  Object.fromEntries(Object.entries(sizes).filter(([, qty]) => qty > 0));

export function CartItemCard({
  item,
  error,
  onUpdated,
  onRemoved,
  onFlushChange,
  cardRef,
}: {
  item: CartItemView;
  /** A submit-time field error for this design (keyed by cart item id server-side). */
  error?: string;
  onUpdated: (item: CartItemView) => void;
  onRemoved: (id: string) => void;
  /** Registers this card's "save now" so the summary can flush edits before submitting. */
  onFlushChange: (id: string, flush: (() => Promise<void>) | null) => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const [sizes, setSizes] = useState<Record<string, number>>(item.sizes);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const pendingRef = useRef<{ sizes?: Record<string, number>; notes?: string }>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the newest PATCH may write state: a slow save must not overwrite a newer one.
  const seqRef = useRef(0);
  // A save already on the wire: submit must wait for it, not race it.
  const inflightRef = useRef<Promise<void> | null>(null);

  const patch = useCallback(
    async (body: { sizes?: Record<string, number>; notes?: string }) => {
      const seq = ++seqRef.current;
      setStatus("saving");
      setSaveError(null);
      try {
        const res = await fetch(`/api/cart/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => null)) as
          { ok: true; item: CartItemView } | { ok: false; error: string } | null;
        if (seq !== seqRef.current) return;
        if (res.ok && data?.ok) {
          onUpdated(data.item);
          setStatus("saved");
          return;
        }
        setStatus("error");
        setSaveError(data && !data.ok ? data.error : "We couldn't save that. Please try again.");
      } catch {
        if (seq !== seqRef.current) return;
        setStatus("error");
        setSaveError("We couldn't save that. Please try again.");
      }
    },
    [item.id, onUpdated],
  );

  const runPatch = useCallback(
    (body: { sizes?: Record<string, number>; notes?: string }) => {
      const promise = patch(body);
      inflightRef.current = promise;
      void promise.finally(() => {
        if (inflightRef.current === promise) inflightRef.current = null;
      });
      return promise;
    },
    [patch],
  );

  /** Saves whatever is pending right now (blur, before submit, or leaving the card). */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const body = pendingRef.current;
    pendingRef.current = {};
    // A blur may have just started a save; the submit button waits for that one too.
    if (inflightRef.current) await inflightRef.current;
    if (body.sizes === undefined && body.notes === undefined) return;
    await runPatch(body);
  }, [runPatch]);

  const schedule = useCallback(
    (next: { sizes?: Record<string, number>; notes?: string }) => {
      pendingRef.current = { ...pendingRef.current, ...next };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), 600);
    },
    [flush],
  );

  useEffect(() => {
    onFlushChange(item.id, flush);
    return () => {
      onFlushChange(item.id, null);
      // Leaving the card must not drop a just-typed size.
      void flush();
    };
  }, [item.id, flush, onFlushChange]);

  const changeSize = (size: string, qty: number) => {
    const value = Number.isFinite(qty) ? Math.min(10000, Math.max(0, Math.trunc(qty))) : 0;
    const next = { ...sizes, [size]: value };
    setSizes(next);
    schedule({ sizes: withoutZeros(next) });
  };

  const changeNotes = (value: string) => {
    setNotes(value);
    schedule({ notes: value });
  };

  const remove = async () => {
    setRemoving(true);
    setRemoveError(null);
    // The item is going away: don't let a pending autosave PATCH it afterwards.
    pendingRef.current = {};
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      const res = await fetch(`/api/cart/${item.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        setConfirmOpen(false);
        onRemoved(item.id);
        return;
      }
      setRemoveError(data?.error ?? "We couldn't remove that. Please try again.");
    } catch {
      setRemoveError("We couldn't remove that. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  const pieces = piecesOf(sizes);
  const notesId = `cart-notes-${item.id}`;

  return (
    <Card
      ref={cardRef}
      tabIndex={-1}
      aria-describedby={error ? `cart-item-error-${item.id}` : undefined}
      data-testid="cart-item"
      data-error={error ? "true" : undefined}
      className={cn(
        "border-border bg-bg-1/90 focus-visible:ring-neon-cyan flex flex-col gap-4 shadow-[var(--glow-panel)] focus-visible:ring-2 focus-visible:outline-none",
        error && "border-danger",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-heading text-text-1 text-base tracking-wide uppercase">{item.garmentName}</h3>
        <p className="text-text-3 font-mono text-xs" data-testid="cart-item-pieces">
          {pieces} {pieces === 1 ? "piece" : "pieces"}
        </p>
      </div>

      {item.views.length > 0 ? (
        <div className="bg-bg-3 border-border grid grid-cols-2 gap-2 overflow-hidden rounded-lg border p-2">
          {item.views.map((view) => (
            <figure key={`${view.view}-${view.area}`} className="flex flex-col gap-1">
              {view.imageUrl ? (
                // Signed storage URLs (R2/MinIO) — host varies by environment, so a plain <img>.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={view.imageUrl}
                  alt={`${item.garmentName} mockup, ${view.view} view, ${view.area}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-md object-contain"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="text-text-3 flex aspect-square w-full items-center justify-center rounded-md text-xs"
                >
                  Preview unavailable
                </div>
              )}
              <figcaption className="text-text-3 text-xs">
                {view.view} · {view.area} · {view.method}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      <ul className="text-text-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {item.colors.map((color) => (
          <li key={color.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="border-border h-3 w-3 shrink-0 rounded-full border"
              style={{ backgroundColor: color.hex }}
            />
            <span>
              <span className="text-text-3">{color.label}:</span> {color.name}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1">
        <SizeGrid
          sizes={item.sizeOptions}
          values={sizes}
          onChange={changeSize}
          idPrefix={`cart-${item.id}`}
          label="Sizes and quantities"
        />
        <p className="text-text-3 text-xs">
          Leave a size at 0 to skip it. {pieces} {pieces === 1 ? "piece" : "pieces"} in this design.
        </p>
      </div>

      <Field
        label="Notes for this design"
        hint={`Optional — ${notes.length}/2000. Print placement, brand, anything we should know.`}
        controlId={notesId}
      >
        <Textarea
          value={notes}
          maxLength={2000}
          rows={2}
          onChange={(e) => changeNotes(e.target.value)}
          onBlur={() => void flush()}
          data-testid="cart-item-notes"
          {...fieldControlProps(notesId, {
            hint: `Optional — ${notes.length}/2000. Print placement, brand, anything we should know.`,
          })}
        />
      </Field>

      <p
        role="status"
        aria-live="polite"
        className={cn("text-xs", status === "error" ? "text-danger" : "text-text-3")}
        data-testid="cart-item-status"
      >
        {status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "Saved"
            : status === "error"
              ? (saveError ?? "We couldn't save that.")
              : ""}
      </p>

      {error ? (
        <p
          role="alert"
          id={`cart-item-error-${item.id}`}
          className="text-danger flex items-center gap-1.5 text-sm"
          data-testid="cart-item-error"
        >
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/?cart=${item.id}#design`} data-testid="cart-item-edit">
            Edit design
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-danger"
          onClick={() => {
            setRemoveError(null);
            setConfirmOpen(true);
          }}
          data-testid="cart-item-remove"
        >
          Remove
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(next) => !next && setConfirmOpen(false)}>
        {confirmOpen ? (
          <DialogContent aria-describedby={`remove-cart-${item.id}`}>
            <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
              Remove this design?
            </DialogTitle>
            <DialogDescription id={`remove-cart-${item.id}`} className="text-text-2 text-sm">
              It comes out of your cart with its mockups. The builder can always make another.
            </DialogDescription>
            {removeError ? (
              <p role="alert" className="text-danger text-sm">
                {removeError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => void remove()}
                loading={removing}
                data-testid="cart-item-remove-confirm"
                className="bg-danger text-text-1 shadow-none hover:shadow-none"
              >
                Remove
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}
