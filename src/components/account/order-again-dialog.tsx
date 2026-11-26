"use client";
/**
 * "Order again" (docs/02 Member perks): a dialog with the garment's size grid, a
 * "Use saved sizes" select (fills the grid from the set's sizes and roster counts),
 * optional notes, and the ≥ 1 total rule (client + server). Success becomes its own
 * state; the list refreshes when the dialog closes.
 */
import { useEffect, useState } from "react";

import type { AccountMockup } from "@/app/api/account/mockups/route";
import type { SizeSet } from "@/lib/size-sets";
import { combineSizesAndRoster, sizesTotal } from "@/lib/member-schemas";
import { GARMENTS } from "@/lib/garments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NETWORK_ERROR, postJson } from "@/components/forms/auth-post";
import { SizeGrid } from "@/components/forms/size-grid";

export function OrderAgainDialog({
  item,
  onClose,
  onOrdered,
}: {
  item: AccountMockup;
  onClose: () => void;
  /** The list re-fetches with the new order. */
  onOrdered: () => void;
}) {
  const garment = GARMENTS.find((g) => g.name === item.garmentName);
  const [values, setValues] = useState<Record<string, number>>({});
  const [sizeSets, setSizeSets] = useState<SizeSet[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  // The saved sets load once; the select only shows when there's at least one.
  useEffect(() => {
    let alive = true;
    fetch("/api/account/size-sets", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { sizeSets?: SizeSet[] } | null;
        if (alive) setSizeSets(data?.sizeSets ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (sent) {
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent aria-describedby="order-again-sent" data-testid="order-again-sent">
          <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
            Order request sent!
          </DialogTitle>
          <DialogDescription id="order-again-sent" className="text-text-2 text-sm">
            We&apos;ll email you the price. The new request is in your list.
          </DialogDescription>
          <div>
            <Button
              type="button"
              onClick={() => {
                onOrdered();
                onClose();
              }}
              data-testid="order-again-close"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const applySizeSet = (id: string) => {
    const set = sizeSets.find((s) => s.id === id);
    if (!set || !garment) return;
    setValues(combineSizesAndRoster(set.sizes, set.roster, garment.sizes));
  };

  const submit = async () => {
    if (sizesTotal(values) < 1) {
      setFieldError("Add at least one size");
      return;
    }
    setPending(true);
    setError(null);
    setFieldError(null);
    const { data: res } = await postJson(`/api/account/orders/${item.id}/reorder`, {
      sizes: Object.fromEntries(Object.entries(values).filter(([, qty]) => qty > 0)),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setPending(false);
    if (res?.ok) {
      setSent(true);
      return;
    }
    setFieldError(res && !res.ok && res.fieldErrors ? (res.fieldErrors.sizes ?? null) : null);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-describedby="order-again-body" data-testid="order-again-dialog" className="max-h-[90dvh]">
        <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
          Order again — {item.garmentName}
        </DialogTitle>
        <DialogDescription id="order-again-body" className="text-text-2 text-sm">
          The same design, printed again. We&apos;ll confirm the price and email you an invoice — nothing is charged
          now.
        </DialogDescription>

        <div className="flex flex-col gap-4">
          {sizeSets.length > 0 ? (
            <Field label="Use saved sizes" hint="Fills the grid from a set you saved." controlId="order-again-sets">
              <Select onValueChange={applySizeSet}>
                <SelectTrigger id="order-again-sets" className="h-11 w-full" data-testid="order-again-sets">
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
            sizes={garment?.sizes ?? []}
            values={values}
            onChange={(size, qty) => setValues((prev) => ({ ...prev, [size]: qty }))}
            idPrefix="order-again"
          />

          <Field
            label="Notes for Charly's"
            hint="Optional — anything different this time?"
            controlId="order-again-notes"
          >
            <Textarea
              id="order-again-notes"
              value={notes}
              maxLength={2000}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="order-again-notes"
            />
          </Field>

          {fieldError || error ? (
            <p role="alert" className="text-danger text-sm" data-testid="order-again-error">
              {fieldError ?? error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void submit()} loading={pending} data-testid="order-again-submit">
              Send order request
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} data-testid="order-again-cancel">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
