"use client";
/** The cart's order summary: design/piece counts, order notes, and one send button. */
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function CartSummary({
  designs,
  pieces,
  notes,
  onNotes,
  sending,
  error,
  onSend,
}: {
  designs: number;
  pieces: number;
  notes: string;
  onNotes: (notes: string) => void;
  sending: boolean;
  error: string | null;
  onSend: () => void;
}) {
  const notesId = "cart-order-notes";
  const hint = `Optional — ${notes.length}/2000.`;
  return (
    <Card className="flex flex-col gap-4 lg:sticky lg:top-24" data-testid="cart-summary">
      <h2 className="font-heading text-text-1 text-lg tracking-wide uppercase">Your order</h2>
      <dl className="text-text-2 grid grid-cols-2 gap-2 text-sm">
        <dt>Designs</dt>
        <dd className="text-text-1 text-right font-mono" data-testid="cart-designs">
          {designs}
        </dd>
        <dt>Pieces</dt>
        <dd className="text-text-1 text-right font-mono" data-testid="cart-pieces">
          {pieces}
        </dd>
      </dl>
      <p className="text-text-2 text-sm">
        We&apos;ll check everything and email you one price for the whole order. Nothing is charged now.
      </p>
      <Field label="Order notes" hint={hint} controlId={notesId}>
        <Textarea
          value={notes}
          maxLength={2000}
          rows={3}
          onChange={(e) => onNotes(e.target.value)}
          data-testid="cart-order-notes"
          {...fieldControlProps(notesId, { hint })}
        />
      </Field>
      {error ? (
        <p role="alert" className="text-danger text-sm" data-testid="cart-submit-error">
          {error}
        </p>
      ) : null}
      <Button type="button" onClick={onSend} disabled={sending} loading={sending} data-testid="cart-submit">
        Send order request
      </Button>
    </Card>
  );
}
