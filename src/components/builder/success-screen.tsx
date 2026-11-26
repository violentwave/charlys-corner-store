"use client";
/**
 * Builder success screens (docs/04 §6 v2) — one per path:
 * - email: mockup images + per-view downloads + coupon ticket + "Order this design" CTA
 *   (returns to the order card with the design intact).
 * - order: confirmation + summary + coupon ticket + "View in My designs".
 * Charly celebrates (reduced-motion safe).
 *
 * `urls` are object URLs the builder created for the client-rendered PNGs at submit
 * time (event handlers may create them; effects shouldn't). They power both the
 * preview images and the Download buttons, so no signed-URL expiry can break them.
 */
import Link from "next/link";

import { CouponTicket } from "@/components/neon/coupon-ticket";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { track } from "@/lib/analytics";
import { VIEW_LABELS, type GarmentId, type ViewId } from "@/lib/garments";

export type MockupResult = {
  mockupId: string;
  intent: "email" | "order";
  coupon: { code: string; expiresAt: string; isNew: boolean };
  mockups: { view: ViewId; url: string }[];
};

export interface SuccessScreenProps {
  garmentId: GarmentId;
  /** Human summary lines: garment, colors, sizes. */
  summary: { garmentName: string; colorNames: string[]; sizeEntries: string[] };
  result: MockupResult;
  /** Object URLs for the client-rendered PNG blobs (blob: URLs), keyed by view. */
  urls: Partial<Record<ViewId, string>>;
  onDesignAnother: () => void;
  /** Email path CTA: back to step 4 with the design intact, focused on the order card. */
  onGoToOrder: () => void;
}

const VIEW_LABEL: Record<ViewId, string> = VIEW_LABELS;

export function SuccessScreen({ garmentId, summary, result, urls, onDesignAnother, onGoToOrder }: SuccessScreenProps) {
  const download = (view: ViewId) => {
    const url = urls[view];
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `charlys-mockup-${garmentId}-${view}.png`;
    a.click();
    track("mockup_downloaded", { garment: garmentId, view });
  };

  if (result.intent === "order") {
    return (
      <div className="flex flex-col gap-4" data-testid="builder-success">
        <div className="flex items-center gap-3">
          <Charly />
          <div>
            <h2 className="font-heading text-neon-green text-lg tracking-wide uppercase">
              Order request sent! We&apos;ll email you the price.
            </h2>
            <p className="text-text-2 text-sm">
              Charly&apos;s will confirm the price and send you an invoice — nothing is charged now.
            </p>
          </div>
        </div>

        <div
          className="border-border bg-bg-2/60 flex flex-col gap-1 rounded-lg p-3 text-sm"
          data-testid="order-summary"
        >
          <p className="text-text-1 font-medium">{summary.garmentName}</p>
          <p className="text-text-2">{summary.colorNames.join(" · ")}</p>
          {summary.sizeEntries.length > 0 ? (
            <p className="text-text-2">Sizes: {summary.sizeEntries.join(", ")}</p>
          ) : null}
        </div>

        {result.coupon.isNew ? null : <p className="text-text-2 text-sm">Here&apos;s your code again.</p>}
        <CouponTicket
          code={result.coupon.code}
          expiresAt={new Date(result.coupon.expiresAt)}
          onCopied={() => toast({ title: "Code copied", description: `${result.coupon.code} is on your clipboard.` })}
        />

        <Button asChild data-testid="view-my-designs">
          <Link href="/account">View in My designs</Link>
        </Button>
        <Button variant="ghost" onClick={onDesignAnother} data-testid="design-another">
          Design another
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="builder-success">
      <div className="flex items-center gap-3">
        <Charly />
        <div>
          <h2 className="font-heading text-neon-green text-lg tracking-wide uppercase">Mockup sent!</h2>
          <p className="text-text-2 text-sm">
            We emailed {result.mockups.length === 1 ? "your mockup" : "your mockups"} to you, along with the coupon
            below.
          </p>
        </div>
      </div>

      {result.mockups.map(({ view }) => (
        <div key={view} className="flex flex-col gap-2">
          <p className="font-heading text-text-1 text-xs tracking-widest uppercase">{VIEW_LABEL[view]}</p>
          {/* Canvas-rendered PNGs come from in-memory blobs; next/image can't optimize blob: URLs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[view] ?? result.mockups.find((m) => m.view === view)?.url}
            alt={`${summary.garmentName} mockup, ${VIEW_LABEL[view].toLowerCase()}`}
            className="border-border max-w-xs self-start rounded-lg border"
            data-testid={`mockup-image-${view}`}
          />
          {urls[view] ? (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => download(view)}
              data-testid={`mockup-download-${view}`}
            >
              Download {VIEW_LABEL[view].toLowerCase()} PNG
            </Button>
          ) : null}
        </div>
      ))}

      {result.coupon.isNew ? null : <p className="text-text-2 text-sm">Here&apos;s your code again.</p>}
      <CouponTicket
        code={result.coupon.code}
        expiresAt={new Date(result.coupon.expiresAt)}
        onCopied={() => toast({ title: "Code copied", description: `${result.coupon.code} is on your clipboard.` })}
      />

      <Button onClick={onGoToOrder} data-testid="goto-order">
        Order this design
      </Button>
      <Button variant="ghost" onClick={onDesignAnother} data-testid="design-another">
        Design another
      </Button>
    </div>
  );
}

/** Simple line-art neon dog (docs/03 signature component), animated only when motion is OK. */
function Charly() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="text-neon-pink h-14 w-14 shrink-0 motion-safe:animate-bounce"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* head */}
      <path d="M18 30c-2-8 5-14 14-14s16 6 14 14" />
      {/* ears */}
      <path d="M18 30c-4-1-7-6-6-11 4 1 7 6 6 11z" />
      <path d="M46 30c4-1 7-6 6-11-4 1-7 6-6 11z" />
      {/* eyes */}
      <circle cx="26" cy="32" r="1" fill="currentColor" />
      <circle cx="38" cy="32" r="1" fill="currentColor" />
      {/* snout + tongue */}
      <circle cx="32" cy="38" r="2" fill="currentColor" />
      <path d="M27 42c3 3 7 3 10 0" />
      <path d="M31 45c0 3 2 4 4 3" />
      {/* collar */}
      <path d="M22 52h20" stroke="var(--neon-cyan)" />
    </svg>
  );
}
