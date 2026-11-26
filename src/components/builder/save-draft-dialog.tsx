"use client";
/**
 * The "Save draft" dialog (docs/02 Member perks, P49-3): a name (60 max, prefilled with
 * the last name or "{Garment} draft"), Save (updates the draft when one is loaded), and
 * "Save as new" once a draft is loaded. At the drafts cap the API's message shows with a
 * link to the Drafts tab.
 */
import Link from "next/link";
import { useState } from "react";

import { DRAFT_NAME_MAX } from "@/lib/member-schemas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface SaveDraftDialogProps {
  /** The draft's current name, or "{Garment} draft" for a first save. */
  initialName: string;
  /** True when this design was loaded from (or saved as) a draft: Save updates it. */
  hasDraft: boolean;
  /** The API's message when the drafts cap is reached (409). */
  capError?: string | null;
  onClose: () => void;
  /** Returns { ok } (the parent toasts "Draft saved"); `asNew` clears the loaded draft's id. */
  onSave: (name: string, asNew: boolean) => Promise<{ ok: boolean; error?: string; capReached?: boolean }>;
}

export function SaveDraftDialog({ initialName, hasDraft, capError, onClose, onSave }: SaveDraftDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async (asNew: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name your draft");
      return;
    }
    setPending(true);
    setError(null);
    const result = await onSave(trimmed.slice(0, DRAFT_NAME_MAX), asNew);
    setPending(false);
    if (result.ok) {
      onClose();
      return;
    }
    setError(result.error ?? "Something went wrong. Please try again.");
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-describedby="save-draft-body" data-testid="save-draft-dialog">
        <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
          {hasDraft ? "Save draft" : "Save this draft"}
        </DialogTitle>
        <DialogDescription id="save-draft-body" className="text-text-2 text-sm">
          Your design waits here for later — images are kept 30 days from each save.
        </DialogDescription>

        <Field label="Draft name" required error={error ?? undefined} controlId="draft-name">
          <Input
            id="draft-name"
            value={name}
            maxLength={DRAFT_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            data-testid="draft-name"
          />
        </Field>

        {capError ? (
          <p role="alert" className="text-danger text-sm" data-testid="draft-cap">
            {capError}{" "}
            <Link href="/account#drafts" className="text-neon-cyan underline-offset-4 hover:underline">
              Open your Drafts tab
            </Link>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void save(false)} loading={pending} data-testid="draft-save">
            {hasDraft ? "Save (update it)" : "Save draft"}
          </Button>
          {hasDraft ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void save(true)}
              data-testid="draft-save-as-new"
            >
              Save as new
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
