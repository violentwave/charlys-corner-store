"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export function PayDoneClient({ id, token }: { id: string; token: string | null }) {
  const t = token;
  const [status, setStatus] = useState<"checking" | "paid" | "timeout">("checking");
  const [paidAt, setPaidAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pay/${id}/status${t ? `?t=${encodeURIComponent(t)}` : ""}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as { status?: string; paidAt?: string | null } | null;
        if (cancelled) return;
        if (json?.status === "paid") {
          setStatus("paid");
          setPaidAt(json.paidAt ?? null);
          return;
        }
        if (attempts < 20) {
          attempts++;
          setTimeout(poll, 3000);
        } else {
          setStatus("timeout");
        }
      } catch {
        if (!cancelled) setStatus("timeout");
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  if (status === "paid") {
    return (
      <main className="mx-auto max-w-lg px-4 py-10" aria-live="polite">
        <h1 className="font-heading text-text-1 text-2xl tracking-wide uppercase">Payment received 🐾</h1>
        <p className="text-text-2 mt-2">
          Thanks! We got your payment{paidAt ? ` on ${new Date(paidAt).toLocaleDateString()}` : ""}. We&apos;ll be in
          touch about your order.
        </p>
        <Link href="/" className="text-neon-cyan mt-6 inline-block text-sm">
          Back home
        </Link>
      </main>
    );
  }
  if (status === "timeout") {
    return (
      <main className="mx-auto max-w-lg px-4 py-10" aria-live="polite">
        <h1 className="font-heading text-text-1 text-2xl tracking-wide uppercase">
          We&apos;ll email you when it clears
        </h1>
        <p className="text-text-2 mt-2">
          Your payment is still processing. We&apos;ll email you as soon as it lands — no need to do anything.
        </p>
        <Link href="/" className="text-neon-cyan mt-6 inline-block text-sm">
          Back home
        </Link>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-lg px-4 py-10" aria-live="polite">
      <h1 className="font-heading text-text-1 text-2xl tracking-wide uppercase">Confirming your payment…</h1>
      <p className="text-text-2 mt-2">We&apos;re waiting for the payment to clear. This takes a few seconds.</p>
    </main>
  );
}
