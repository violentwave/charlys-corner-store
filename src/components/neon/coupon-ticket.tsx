"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { COUPON_RULES } from "@/lib/coupons";

export interface CouponTicketProps {
  code: string;
  expiresAt: Date;
  className?: string;
}

/** Fixed to the shop's time zone so server render and browser hydration print the same date. */
export function formatExpiry(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function formatMinimum(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function CouponTicket({ code, expiresAt, className }: CouponTicketProps) {
  const [status, setStatus] = React.useState<"" | "copied" | "selected">("");
  const resetTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(resetTimer.current), []);
  const codeRef = React.useRef<HTMLSpanElement>(null);

  const rules = `${COUPON_RULES.percentOff}% off your 2nd order · ${formatMinimum(
    COUPON_RULES.minOrderCents,
  )} minimum · expires ${formatExpiry(expiresAt)} · one per email`;

  const handleCopy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      // Fallback: select the code text.
      const node = codeRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    setStatus(ok ? "copied" : "selected");
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setStatus(""), 3000);
  };

  return (
    <div
      className={cn(
        "border-neon-yellow bg-bg-2/80 text-text-1 shadow-glow-cyan relative rounded-xl border-2 border-dashed p-6 font-mono",
        className,
      )}
    >
      {/* ticket notches */}
      <span aria-hidden="true" className="bg-bg-0 absolute top-1/2 -left-3 h-6 w-6 -translate-y-1/2 rounded-full" />
      <span aria-hidden="true" className="bg-bg-0 absolute top-1/2 -right-3 h-6 w-6 -translate-y-1/2 rounded-full" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-text-3 text-xs tracking-widest uppercase">Coupon code</span>
          <span ref={codeRef} className="text-neon-yellow text-lg font-bold tracking-widest">
            {code}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={handleCopy} aria-label={`Copy coupon code ${code}`}>
          {status === "copied" ? "Copied!" : "Copy"}
        </Button>
      </div>

      <p className="text-text-2 mt-4 text-xs">{rules}</p>

      <span role="status" aria-live="polite" className="sr-only">
        {status === "copied" ? "Code copied" : status === "selected" ? "Code selected. Press Ctrl+C to copy." : ""}
      </span>
    </div>
  );
}
