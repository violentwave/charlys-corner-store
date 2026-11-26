"use client";
/**
 * Step 3 sticky action bar, below lg only (P51-1): Back · Save draft · Continue, with
 * "Start over" (and Undo/Redo) one tap away in the "More" overflow menu — so the canvas
 * never has to be scrolled to reach a step change. Respects the safe-area inset. The
 * in-flow step footer renders `hidden` at this size, so no button exists twice.
 */
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { StartOverButton } from "./start-over-dialog";

export interface MobileActionBarProps {
  canGoBack: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onContinue: () => void;
  onSaveDraft: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onStartOver: () => void;
}

/** Overflow menu above the bar (Start over / Undo / Redo): Esc and outside-click close it. */
function MoreMenu({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onStartOver,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onStartOver: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // Radix dialogs (Start over's confirm) portal to the body: a click inside one must
      // not close the menu — that would unmount the dialog mid-interaction.
      if ((e.target as Element | null)?.closest?.("[role='dialog']")) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const menuItem =
    "text-text-1 hover:bg-bg-3 focus-visible:ring-neon-cyan flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none";

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More actions"
        data-testid="action-more"
        className="h-11 w-11 px-0"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⋯
        </span>
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label="More actions"
          className="border-border bg-bg-1 shadow-glow-cyan absolute right-0 bottom-full z-10 mb-2 flex w-44 flex-col gap-1 rounded-lg border p-1"
        >
          <StartOverButton onConfirm={onStartOver} />
          <button
            type="button"
            role="menuitem"
            disabled={!canUndo}
            data-testid="undo"
            className={menuItem}
            onClick={() => {
              setOpen(false);
              onUndo();
            }}
          >
            Undo
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canRedo}
            data-testid="redo"
            className={menuItem}
            onClick={() => {
              setOpen(false);
              onRedo();
            }}
          >
            Redo
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function MobileActionBar({
  canGoBack,
  canUndo,
  canRedo,
  onBack,
  onContinue,
  onSaveDraft,
  onUndo,
  onRedo,
  onStartOver,
}: MobileActionBarProps) {
  return (
    <div
      data-testid="action-bar"
      className="bg-bg-0/95 border-border fixed inset-x-0 bottom-0 z-40 border-t px-3 pt-2 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex max-w-xl items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-11 shrink-0 whitespace-nowrap"
          onClick={onBack}
          disabled={!canGoBack}
        >
          ← Back
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-11 flex-1 text-xs whitespace-nowrap"
          onClick={onSaveDraft}
          data-testid="save-draft"
        >
          Save draft
        </Button>
        <MoreMenu canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} onStartOver={onStartOver} />
        <Button
          size="sm"
          className="h-11 flex-1 text-xs whitespace-nowrap"
          onClick={onContinue}
          data-testid="action-continue"
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
