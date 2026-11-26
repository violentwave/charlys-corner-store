"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function PayWithSavedCard({
  id,
  total,
  cards,
  token,
}: {
  id: string;
  total: number;
  cards: { id: string; brand: string; last4: string; expMonth: number; expYear: number }[];
  token: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(cards[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cards.length === 0) return null;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${id}/card`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: selected }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        paid?: boolean;
        pending?: boolean;
        error?: string;
      } | null;
      // Paid, or still clearing at Square: the done page polls until the webhook settles it.
      if (res.ok && (data?.paid || data?.pending)) {
        router.push(`/pay/${id}/done${token ? `?t=${encodeURIComponent(token)}` : ""}`);
        return;
      }
      setError(data?.error ?? "Card declined.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-border bg-bg-2 mt-6 rounded-2xl border p-4">
      <p className="text-text-1 text-sm font-medium">Pay with a saved card</p>
      <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Saved cards">
        {cards.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="card"
              value={c.id}
              checked={selected === c.id}
              onChange={() => setSelected(c.id)}
            />
            <span className="text-text-1">
              {c.brand.replace(/_/g, " ")} •••• {c.last4}{" "}
              <span className="text-text-3">
                (exp {String(c.expMonth).padStart(2, "0")}/{c.expYear})
              </span>
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={pay}
        disabled={busy || !selected}
        className="bg-neon-pink text-bg-0 shadow-glow-pink mt-3 rounded-full px-6 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Processing…" : `Pay $${(total / 100).toFixed(2)} with this card`}
      </button>
    </div>
  );
}
