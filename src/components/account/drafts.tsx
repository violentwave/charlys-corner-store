"use client";
/**
 * The "Drafts" tab (docs/02 Member perks, P49-3): saved builder designs. Open one in the
 * builder (/?draft=<id>#design), delete it (confirm). Draft images are re-uploaded on
 * every save, so they live 30 days from the LAST save — each row says when they go.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import type { DraftSummary } from "@/app/api/account/drafts/route";
import { getGarment } from "@/lib/garments";
import { MOCKUP_FILES_RETENTION_DAYS } from "@/lib/retention";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

export function Drafts() {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DraftSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const reload = () => {
    fetch("/api/account/drafts", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { drafts?: DraftSummary[]; error?: string } | null;
        if (res.ok && data?.drafts) {
          setDrafts(data.drafts);
          setError(null);
        } else {
          setError(data?.error ?? "We couldn't load your drafts. Please refresh the page.");
        }
      })
      .catch(() => setError("We couldn't load your drafts. Please refresh the page."));
  };

  useEffect(reload, []);

  const remove = async () => {
    if (!deleting) return;
    setPending(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/account/drafts/${deleting.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        setDrafts((prev) => (prev ? prev.filter((d) => d.id !== deleting.id) : prev));
        setDeleting(null);
        setAnnouncement("Draft deleted.");
        return;
      }
      setDeleteError(data?.error ?? "Something went wrong. Please try again.");
    } catch {
      setDeleteError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4">
        <p className="text-danger text-sm">{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }
  if (drafts === null) {
    return (
      <p role="status" className="text-text-2 animate-pulse text-sm" data-testid="drafts-loading">
        Loading your drafts…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="drafts">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <p
        role="note"
        className="border-border bg-bg-2/60 text-text-2 rounded-xl border p-3 text-sm"
        data-testid="drafts-note"
      >
        Draft images are kept {MOCKUP_FILES_RETENTION_DAYS} days after each save. Saving again resets the clock.
      </p>

      {drafts.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <p className="font-heading text-text-1 text-lg tracking-wide uppercase" data-testid="drafts-empty">
            No saved drafts yet
          </p>
          <p className="text-text-2 mx-auto mt-2 max-w-sm text-sm">
            Mid-design? Hit &ldquo;Save draft&rdquo; in the designer and pick it up here later.
          </p>
          <Button asChild className="mt-6">
            <Link href="/#design">Open the designer</Link>
          </Button>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((draft) => {
            const daysRemaining = draft.filesExpireAt ? daysLeft(draft.filesExpireAt) : null;
            const expired = !!draft.filesExpireAt && daysRemaining !== null && daysRemaining <= 0;
            return (
              <li key={draft.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-text-1 text-sm font-medium" data-testid={`draft-name-${draft.id}`}>
                      {draft.name}
                    </p>
                    <p className="text-text-3 text-xs" data-testid={`draft-meta-${draft.id}`}>
                      {getGarment(draft.garment as never)?.name ?? draft.garment} · Saved{" "}
                      <time dateTime={draft.updatedAt}>{dateLabel(draft.updatedAt)}</time> ·{" "}
                      {draft.imageCount > 0
                        ? `${draft.imageCount} image${draft.imageCount === 1 ? "" : "s"}`
                        : "no images"}
                    </p>
                    {draft.filesExpireAt ? (
                      <p className="text-text-3 text-xs" data-testid={`draft-expiry-${draft.id}`}>
                        {expired ? (
                          "Images deleted"
                        ) : (
                          <>
                            Images deleted on{" "}
                            <time dateTime={draft.filesExpireAt}>{dateLabel(draft.filesExpireAt)}</time>
                          </>
                        )}
                        {daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 7 ? (
                          <Badge variant="yellow" className="ml-2" data-testid={`draft-expiry-warning-${draft.id}`}>
                            <span aria-hidden="true">⚠</span> {daysRemaining} days left
                          </Badge>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" data-testid={`open-draft-${draft.id}`}>
                      <Link href={`/?draft=${draft.id}#design`}>Open</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(draft);
                      }}
                      data-testid={`delete-draft-${draft.id}`}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {deleting ? (
        <Dialog open onOpenChange={(next) => !next && setDeleting(null)}>
          <DialogContent aria-describedby="delete-draft-body">
            <p id="delete-draft-body" className="text-text-2 text-sm" role="description">
              Delete &ldquo;{deleting.name}&rdquo;? Its images are deleted too, and this can&apos;t be undone.
            </p>
            {deleteError ? (
              <p role="alert" className="text-danger text-sm">
                {deleteError}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="bg-danger text-text-1 shadow-none hover:shadow-none"
                onClick={() => void remove()}
                loading={pending}
                data-testid="confirm-delete-draft"
              >
                Delete
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
