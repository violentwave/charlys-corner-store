"use client";
/**
 * The /cart list (docs/04 §5b): one card per design plus a summary that sends the whole
 * cart as ONE order. No prices here — the shop prices the order after checking it. Sizes
 * and notes autosave per card; submit flushes any pending edit first, then maps the
 * server's fieldErrors (keyed by cart item id) back onto the right card.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CartItemView } from "@/lib/cart";
import { CART_CHANGED_EVENT } from "@/lib/cart-events";

import { CartIcon } from "@/components/builder/studio-icons";

import { CartItemCard } from "./cart-item-card";
import { CartSummary } from "./cart-summary";

type CartResponse = { ok: true; items: CartItemView[]; max: number; pieces: number } | { ok: false; error: string };

export function CartView() {
  const [items, setItems] = useState<CartItemView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [orderNotes, setOrderNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ orderId: string; itemCount: number } | null>(null);

  const flushers = useRef(new Map<string, () => Promise<void>>());
  const cards = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    let alive = true;
    fetch("/api/cart", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as CartResponse | null;
        if (!alive) return;
        if (res.ok && data?.ok) {
          setItems(data.items);
          setError(null);
          return;
        }
        setItems([]);
        setError(data && !data.ok ? data.error : "We couldn't load your cart. Please refresh the page.");
      })
      .catch(() => {
        if (!alive) return;
        setItems([]);
        setError("We couldn't load your cart. Please refresh the page.");
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const onUpdated = useCallback((item: CartItemView) => {
    setItems((prev) => prev?.map((it) => (it.id === item.id ? item : it)) ?? prev);
  }, []);

  const onRemoved = useCallback((id: string) => {
    setItems((prev) => prev?.filter((it) => it.id !== id) ?? prev);
    setFieldErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    window.dispatchEvent(new Event(CART_CHANGED_EVENT));
  }, []);

  const onFlushChange = useCallback((id: string, flush: (() => Promise<void>) | null) => {
    if (flush) flushers.current.set(id, flush);
    else flushers.current.delete(id);
  }, []);

  const retry = () => {
    setItems(null);
    setError(null);
    setReloadKey((key) => key + 1);
  };

  const submit = async () => {
    if (sending) return;
    setSending(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      // Sizes typed but not yet saved must reach the server before it validates the cart.
      await Promise.all([...flushers.current.values()].map((flush) => flush()));
      const res = await fetch("/api/cart/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: orderNotes.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; orderId: string; itemCount: number }
        | { ok: false; error: string; fieldErrors?: Record<string, string> }
        | null;
      if (res.ok && data?.ok) {
        setSent({ orderId: data.orderId, itemCount: data.itemCount });
        window.dispatchEvent(new Event(CART_CHANGED_EVENT));
        return;
      }
      if (data && !data.ok) {
        setSubmitError(data.error);
        if (data.fieldErrors) {
          setFieldErrors(data.fieldErrors);
          const first = Object.keys(data.fieldErrors).find((id) => cards.current.has(id));
          if (first) cards.current.get(first)?.focus();
        }
        return;
      }
      setSubmitError("Something went wrong. Please try again or email us.");
    } catch {
      setSubmitError("Something went wrong. Please try again or email us.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Card
        className="border-border bg-bg-1/90 flex flex-col items-start gap-4 shadow-[var(--glow-panel)]"
        data-testid="cart-sent"
      >
        <p className="font-heading text-text-1 text-xl tracking-wide uppercase">Order request sent!</p>
        <p className="text-text-2 text-sm">
          We&apos;ll email you the price for your {sent.itemCount} {sent.itemCount === 1 ? "design" : "designs"} once
          we&apos;ve checked everything. Nothing is charged now.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href="/account#designs">View in My designs</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/#design">Design another</Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4">
        <p className="text-danger text-sm">{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (items === null) {
    return (
      <p role="status" className="text-text-2 animate-pulse text-sm" data-testid="cart-loading">
        Fetching your cart…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <Card
        className="border-border bg-bg-1/90 flex flex-col items-center px-6 py-16 text-center shadow-[var(--glow-panel)]"
        data-testid="cart-empty"
      >
        <span
          aria-hidden="true"
          className="border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan mb-5 flex h-14 w-14 items-center justify-center rounded-full border"
        >
          <CartIcon className="h-6 w-6" />
        </span>
        <p className="font-heading text-text-1 text-xl tracking-wide uppercase">Your cart is empty — for now</p>
        <p className="text-text-2 mx-auto mt-2 max-w-sm text-sm">
          Collect a few designs here and send them together: one price for the whole order.
        </p>
        <Button asChild className="mt-6">
          <Link href="/#design">Design something</Link>
        </Button>
        <p className="text-text-3 mt-6 text-xs">Have a Ruffin awesome day 🐾</p>
      </Card>
    );
  }

  const pieces = items.reduce((sum, item) => sum + item.pieces, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <CartItemCard
            key={item.id}
            item={item}
            error={fieldErrors[item.id]}
            onUpdated={onUpdated}
            onRemoved={onRemoved}
            onFlushChange={onFlushChange}
            cardRef={(el) => {
              if (el) cards.current.set(item.id, el);
              else cards.current.delete(item.id);
            }}
          />
        ))}
      </div>
      <CartSummary
        designs={items.length}
        pieces={pieces}
        notes={orderNotes}
        onNotes={setOrderNotes}
        sending={sending}
        error={submitError}
        onSend={() => void submit()}
      />
    </div>
  );
}
