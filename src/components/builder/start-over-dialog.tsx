"use client";
/**
 * "Start over" (Logan, 2026-11-26): wipes the whole design (layers, uploads, colors, sizes,
 * notes) and returns to garment selection. It can't be undone (uploaded files are dropped),
 * so it asks first.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function StartOverButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} data-testid="start-over">
        Start over
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="start-over-dialog">
          <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
            Start over?
          </DialogTitle>
          <DialogDescription className="text-text-2 text-sm">
            This clears your whole design, including uploads, and takes you back to picking a garment. It can&apos;t be
            undone.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Keep designing</Button>
            </DialogClose>
            <Button
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              data-testid="start-over-confirm"
            >
              Start over
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
