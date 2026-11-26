"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Card = { id: string; brand: string; last4: string; expMonth: number; expYear: number };

const MAX_CARDS = 3;

/** Public Web Payments SDK settings, from GET /api/account/cards (null = payments off here). */
type SdkConfig = { applicationId: string; locationId: string; scriptUrl: string };

export function PaymentMethods() {
  const [sdk, setSdk] = useState<SdkConfig | null | undefined>(undefined);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/account/cards", { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as {
      cards?: Card[];
      sdk?: SdkConfig | null;
      error?: string;
    } | null;
    if (!res.ok) {
      setError(data?.error ?? "Couldn't load your cards.");
      setCards([]);
    } else {
      setCards(data?.cards ?? []);
      setSdk(data?.sdk ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/cards", { cache: "no-store" })
      .then((res) =>
        res.json().then((data: { cards?: Card[]; sdk?: SdkConfig | null; error?: string } | null) => ({ res, data })),
      )
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Couldn't load your cards.");
          setCards([]);
        } else {
          setCards(data?.cards ?? []);
          setSdk(data?.sdk ?? null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your cards.");
        setCards([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (sdk === null) {
    return (
      <div className="text-text-2 text-sm">
        Saved cards are coming soon — payments aren&apos;t enabled on this environment yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-2 text-sm">
        Save up to {MAX_CARDS} cards for faster checkout. Card details never touch our servers.
      </p>
      {loading ? (
        <p className="text-text-3 text-sm">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(cards ?? []).map((c) => (
            <li
              key={c.id}
              className="border-border bg-bg-2 flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div>
                <p className="text-text-1 text-sm font-medium">
                  {c.brand} •••• {c.last4}
                </p>
                <p className="text-text-3 text-xs">
                  Expires {String(c.expMonth).padStart(2, "0")}/{c.expYear}
                </p>
              </div>
              {confirming === c.id ? (
                <span className="flex items-center gap-2" role="group" aria-label={`Remove card ending ${c.last4}?`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={async () => {
                      const msg = await removeCard(c.id);
                      setConfirming(null);
                      if (msg) setError(msg);
                      else await loadCards();
                    }}
                    data-testid={`confirm-remove-card-${c.id}`}
                  >
                    Remove
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:text-danger"
                  onClick={() => setConfirming(c.id)}
                  data-testid={`remove-card-${c.id}`}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
          {(cards ?? []).length === 0 ? <p className="text-text-3 text-sm">No saved cards yet.</p> : null}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <div>
        <Button onClick={() => setAddOpen(true)} disabled={(cards?.length ?? 0) >= MAX_CARDS} data-testid="add-card">
          Add a card
        </Button>
        {(cards?.length ?? 0) >= MAX_CARDS ? (
          <p className="text-text-3 mt-1 text-xs">You&apos;ve reached the 3-card limit. Remove one to add another.</p>
        ) : null}
      </div>

      {sdk ? <AddCardDialog open={addOpen} sdk={sdk} onClose={() => setAddOpen(false)} onSaved={loadCards} /> : null}
    </div>
  );
}

/** Removes a card; returns an error message, or null when it worked. */
async function removeCard(id: string): Promise<string | null> {
  const res = await fetch(`/api/account/cards/${id}`, { method: "DELETE" }).catch(() => null);
  if (res?.ok) return null;
  const data = (await res?.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Couldn't remove the card.";
}

function AddCardDialog({
  open,
  sdk,
  onClose,
  onSaved,
}: {
  open: boolean;
  sdk: SdkConfig;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<{
    payments: { verifyBuyer: (t: string, o: unknown) => Promise<{ status?: string; token?: string }> };
    card: {
      attach: (el: HTMLElement) => Promise<void>;
      tokenize: () => Promise<{ status: string; token?: string; errors?: { message?: string }[] }>;
    };
  } | null>(null);
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Reset the form whenever the dialog opens (adjust state during render, react.dev).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setReady(false);
      setError(null);
      setName("");
      setZip("");
      setConsent(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    const script = document.createElement("script");
    script.src = sdk.scriptUrl;
    script.async = true;
    script.onload = async () => {
      try {
        const Square = (
          window as {
            Square?: {
              payments: (
                a: string,
                l: string,
              ) => {
                card: () => Promise<unknown>;
                verifyBuyer: (t: string, o: unknown) => Promise<{ status?: string; token?: string }>;
              };
            };
          }
        ).Square;
        if (!Square) throw new Error("Square SDK didn't load.");
        const payments = Square.payments(sdk.applicationId, sdk.locationId);
        const card = (await payments.card()) as {
          attach: (el: HTMLElement) => Promise<void>;
          tokenize: () => Promise<{ status: string; token?: string; errors?: { message?: string }[] }>;
        };
        if (containerRef.current) await card.attach(containerRef.current);
        cardRef.current = { payments, card };
        setReady(true);
      } catch (e) {
        setError("Couldn't load the card form. Please try again.");
      }
    };
    script.onerror = () => setError("Couldn't load the card form. Please try again.");
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
      cardRef.current = null;
    };
  }, [open, sdk]);

  const submit = async () => {
    if (!consent) {
      setError("Please consent to saving the card.");
      return;
    }
    const handle = cardRef.current;
    if (!handle) return;
    setBusy(true);
    setError(null);
    try {
      const tokenResult = await handle.card.tokenize();
      if (tokenResult.status !== "OK" || !tokenResult.token) {
        setError(tokenResult.errors?.[0]?.message ?? "Couldn't read the card.");
        setBusy(false);
        return;
      }
      let verificationToken: string | undefined;
      try {
        const v = await handle.payments.verifyBuyer(tokenResult.token, {
          amount: "0",
          currencyCode: "USD",
          intent: "STORE",
          billingContact: { givenName: name, postalCode: zip },
        });
        if (v?.status === "OK" && v.token) verificationToken = v.token;
      } catch {
        // verification optional in sandbox; continue
      }
      const res = await fetch("/api/account/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceId: tokenResult.token,
          verificationToken,
          cardholderName: name,
          postalCode: zip,
          consent,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Couldn't save the card.");
        setBusy(false);
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogTitle>Add a card</DialogTitle>
        <div className="flex flex-col gap-3">
          <div
            ref={containerRef}
            className="border-border min-h-[44px] rounded-md border p-2"
            aria-label="Card details"
          />
          <Input
            placeholder="Cardholder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
          <Input
            placeholder="ZIP / postal code"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            className="h-11"
          />
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>Save this card to my Charly&apos;s account for future orders. I can remove it anytime.</span>
          </label>
          {error ? (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!ready || busy || !consent} data-testid="save-card">
              {busy ? "Saving…" : "Save card"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
