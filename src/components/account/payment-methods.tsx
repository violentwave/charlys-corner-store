"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { postJson, NETWORK_ERROR } from "@/components/forms/auth-post";

type Card = { id: string; brand: string; last4: string; expMonth: number; expYear: number };

const MAX_CARDS = 3;

function sdkUrl(): string {
  return process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";
}

function appId(): string {
  return process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? "";
}
function locationId(): string {
  return process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";
}

export function PaymentMethods() {
  const configured = Boolean(appId() && locationId());
  const [cards, setCards] = useState<Card[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/account/cards", { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { cards?: Card[]; error?: string } | null;
    if (!res.ok) {
      setError(data?.error ?? "Couldn't load your cards.");
      setCards([]);
    } else {
      setCards(data?.cards ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/cards", { cache: "no-store" })
      .then((res) => res.json().then((data: { cards?: Card[]; error?: string } | null) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Couldn't load your cards.");
          setCards([]);
        } else {
          setCards(data?.cards ?? []);
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

  if (!configured) {
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
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={() => void removeCard(c.id, loadCards)}
                data-testid={`remove-card-${c.id}`}
              >
                Remove
              </Button>
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

      <AddCardDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={loadCards} />
    </div>
  );
}

async function removeCard(id: string, reload: () => Promise<void>) {
  if (!confirm("Remove this card?")) return;
  const res = await fetch(`/api/account/cards/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    alert(data?.error ?? "Couldn't remove the card.");
    return;
  }
  await reload();
}

function AddCardDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
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
    script.src = sdkUrl();
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
        const payments = Square.payments(appId(), locationId());
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
  }, [open]);

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
