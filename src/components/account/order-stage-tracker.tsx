"use client";
/**
 * The order-request stage tracker (docs/02 Member perks): Received → Price sent → In
 * production → Ready → Completed. Done steps get a check, the current one is announced in
 * text ("Current") and with aria-current="step" — never color alone. Cancelled collapses
 * to one badge + the explanation.
 */
import type { AccountMockup } from "@/app/api/account/mockups/route";
import { Badge } from "@/components/ui/badge";

type Stage = NonNullable<AccountMockup["orderStage"]>;

/** The five visible steps, in order (cancelled isn't a step — it replaces the tracker). */
const STEPS = ["received", "quoted", "in_production", "ready", "completed"] as const;

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

export function OrderStageTracker({ stage }: { stage: Stage }) {
  const currentIndex = STEPS.indexOf(stage.stage as (typeof STEPS)[number]);
  const cancelled = stage.stage === "cancelled";

  return (
    <div className="flex flex-col gap-2" data-testid="order-stage">
      {cancelled ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">
            <span aria-hidden="true">✕</span> Cancelled
          </Badge>
          <span className="text-text-3 text-xs">{stage.description}</span>
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5" data-testid="stage-list">
          {STEPS.map((step, index) => {
            const done = index < currentIndex;
            const current = index === currentIndex;
            return (
              <li
                key={step}
                aria-current={current ? "step" : undefined}
                className="text-text-2 flex items-center gap-2 text-sm"
                data-testid={`stage-${step}`}
              >
                <span
                  aria-hidden="true"
                  className={
                    done
                      ? "bg-neon-green text-bg-0 flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                      : current
                        ? "bg-neon-pink text-bg-0 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                        : "border-border text-text-3 flex h-5 w-5 items-center justify-center rounded-full border text-[10px]"
                  }
                >
                  {done ? "✓" : index + 1}
                </span>
                <span className={current ? "text-text-1 text-sm font-medium" : undefined}>{STEP_LABELS[index]}</span>
                {done ? <span className="sr-only">(done)</span> : null}
                {current ? (
                  <Badge variant="pink" data-testid={`stage-current-${step}`}>
                    Current
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-text-2 text-sm">{stage.description}</p>
      {stage.updatedAt ? (
        <p className="text-text-3 text-xs">
          Updated <time dateTime={stage.updatedAt}>{dateLabel(stage.updatedAt)}</time>
        </p>
      ) : null}
    </div>
  );
}

/** The five canonical step names — keep in step with ORDER_STAGE_LABELS (src/lib/order-stage.ts). */
const STEP_LABELS = ["Received", "Price sent", "In production", "Ready", "Completed"];
