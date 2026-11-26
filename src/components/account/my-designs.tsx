"use client";
/**
 * "My designs" (docs/02 Member perks): the coupon wallet on top, saved mockups and order
 * requests. Emailed mockups' files are deleted after MOCKUP_FILES_RETENTION_DAYS (an R2
 * lifecycle rule) — each card shows the deletion date, a low-time warning, Save links
 * while the files exist, and Re-send. Order requests carry the shop's stage tracker,
 * "Order again", and hide-only removal.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AccountMockup } from "@/app/api/account/mockups/route";
import { MOCKUP_FILES_RETENTION_DAYS } from "@/lib/retention";
import { Wallet } from "./wallet";
import { OrderStageTracker } from "./order-stage-tracker";
import { OrderAgainDialog } from "./order-again-dialog";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NETWORK_ERROR, postJson } from "@/components/forms/auth-post";

/** Friendly labels for the request_status enum (db/schema.ts). */
const STATUS_LABELS: Record<string, { label: string; variant: "neutral" | "cyan" | "yellow" | "green" }> = {
  new: { label: "Received", variant: "cyan" },
  contacted: { label: "We reached out", variant: "cyan" },
  quoted: { label: "Quote sent", variant: "yellow" },
  ordered: { label: "Order placed", variant: "green" },
  closed: { label: "Closed", variant: "neutral" },
  spam: { label: "Flagged", variant: "neutral" },
};

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

/** Re-sends the mockup email (same attachment as the first time); the API's messages surface as toasts. */
function ResendButton({ itemId, email }: { itemId: string; email: string }) {
  const [pending, setPending] = useState(false);

  const send = async () => {
    setPending(true);
    const { data: res } = await postJson(`/api/account/mockups/${itemId}/resend`);
    setPending(false);
    if (res?.ok) {
      toast({ title: `Sent to ${email}` });
      return;
    }
    // 410 (files gone) / 429 (3 a day) carry friendly messages — show them as-is.
    toast({ title: res?.error ?? NETWORK_ERROR, variant: "error" });
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void send()}
      loading={pending}
      data-testid="resend-mockup"
    >
      Re-send email
    </Button>
  );
}

function DesignCard({
  item,
  email,
  onRemoved,
  onListChanged,
}: {
  item: AccountMockup;
  email: string;
  onRemoved: (item: AccountMockup) => void;
  onListChanged: () => void;
}) {
  const status = STATUS_LABELS[item.status];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [orderAgain, setOrderAgain] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMockup = item.kind === "mockup";
  const daysRemaining = item.filesExpireAt ? daysLeft(item.filesExpireAt) : null;

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/mockups/${item.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        setConfirmOpen(false);
        onRemoved(item);
        return;
      }
      setError(data?.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4" data-testid="design-card">
      {item.views.length > 0 ? (
        <div className="bg-bg-3 border-border grid grid-cols-2 gap-2 overflow-hidden rounded-lg border p-2">
          {item.views.map((view) => (
            <div key={`${item.id}-${view.view}-${view.area}`} className="flex flex-col gap-1">
              {view.imageUrl ? (
                // Signed storage URLs (R2/MinIO) — host varies by environment, so a plain <img>.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={view.imageUrl}
                  alt={`${item.garmentName} mockup, ${view.view} view, ${view.area}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-md object-contain"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="text-text-3 flex aspect-square w-full items-center justify-center rounded-md text-xs"
                >
                  {item.filesExpired
                    ? `Images deleted after ${MOCKUP_FILES_RETENTION_DAYS} days`
                    : "Preview unavailable"}
                </div>
              )}
              {/* Save while the file exists (a plain anchor download — no JS). */}
              {view.downloadUrl ? (
                <a
                  href={view.downloadUrl}
                  download
                  data-testid={`save-${view.view.toLowerCase().replace(/\s+/g, "-")}`}
                  className="border-neon-cyan text-neon-cyan focus-visible:ring-neon-cyan focus-visible:ring-offset-bg-0 hover:bg-bg-3 flex h-9 items-center justify-center rounded-md border text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  Save {view.view.toLowerCase()} image
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-text-1 text-sm tracking-wide uppercase">{item.garmentName}</h3>
          {item.kind === "order" && status ? (
            <Badge variant={status.variant} data-testid="order-status">
              {status.label}
            </Badge>
          ) : null}
        </div>

        <ul className="text-text-2 flex flex-col gap-1 text-sm">
          <li>
            <span className="text-text-3">Colors:</span> {item.colors.map((color) => color.name).join(", ")}
          </li>
          {item.sizes.length > 0 ? (
            <li>
              <span className="text-text-3">Sizes:</span> {item.sizes.join(", ")}
            </li>
          ) : null}
          <li>
            <span className="text-text-3">Saved:</span>{" "}
            <time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time>
          </li>
          {isMockup ? (
            <li data-testid="retention-status">
              {item.filesExpired || !item.filesExpireAt ? (
                <span className="text-text-3">Images deleted</span>
              ) : (
                <>
                  <span className="text-text-3">
                    Images deleted on <time dateTime={item.filesExpireAt}>{dateLabel(item.filesExpireAt)}</time>
                  </span>
                  {daysRemaining !== null && daysRemaining <= 7 ? (
                    <Badge variant="yellow" className="ml-2" data-testid="expiry-warning">
                      <span aria-hidden="true">⚠</span>{" "}
                      {daysRemaining <= 0 ? "Deleting soon" : `${daysRemaining} days left`}
                    </Badge>
                  ) : null}
                </>
              )}
            </li>
          ) : (
            <li className="text-text-3" data-testid="kept-by-shop">
              Kept by the shop
            </li>
          )}
        </ul>
      </div>

      {item.orderStage ? (
        <div className="border-border border-t pt-3">
          <OrderStageTracker stage={item.orderStage} />
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={item.restorePath}>Open in builder</Link>
        </Button>
        {item.canResend ? <ResendButton itemId={item.id} email={email} /> : null}
        {item.canReorder ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOrderAgain(true)}
            data-testid="order-again"
          >
            Order again
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={isMockup ? "text-danger" : undefined}
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
          data-testid={isMockup ? "delete-design" : "hide-design"}
        >
          {isMockup ? "Delete" : "Remove"}
        </Button>
      </div>

      {orderAgain ? (
        <OrderAgainDialog
          item={item}
          onClose={() => setOrderAgain(false)}
          onOrdered={() => {
            setOrderAgain(false);
            onListChanged();
          }}
        />
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={(next) => !next && setConfirmOpen(false)}>
        {confirmOpen ? (
          <DialogContent aria-describedby="remove-design-body">
            <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
              {isMockup ? "Delete this mockup?" : "Remove this order from your list?"}
            </DialogTitle>
            <DialogDescription id="remove-design-body" className="text-text-2 text-sm">
              {isMockup
                ? "The images and design are deleted for good. Save them first if you want them."
                : "The shop still has your order; this only hides it here."}
            </DialogDescription>
            {error ? (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => void remove()}
                loading={deleting}
                data-testid="confirm-remove"
                className="bg-danger text-text-1 shadow-none hover:shadow-none"
              >
                {isMockup ? "Delete" : "Remove"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmOpen(false)}
                data-testid="cancel-remove"
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}

function EmptyState({ kind }: { kind: "mockup" | "order" }) {
  const copy =
    kind === "mockup"
      ? {
          title: "No saved mockups yet",
          body: "Fire up the builder, play dress-up with a garment, and your saved mockups will wait for you here.",
          cta: "Design your first mockup",
        }
      : {
          title: "No order requests yet",
          body: "When you ask us to print one of your designs, the request and its status show up here.",
          cta: "Start a design",
        };
  return (
    <Card className="items-center py-12 text-center">
      <p className="font-heading text-text-1 text-lg tracking-wide uppercase" data-testid="empty-state">
        {copy.title}
      </p>
      <p className="text-text-2 mx-auto mt-2 max-w-sm text-sm">{copy.body}</p>
      <Button asChild className="mt-6">
        <Link href="/#design">{copy.cta}</Link>
      </Button>
      <p className="text-text-3 mt-6 text-xs">Have a Ruffin awesome day 🐾</p>
    </Card>
  );
}

export function MyDesigns({ email }: { email: string }) {
  const [items, setItems] = useState<AccountMockup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  // Bumped by "Try again"; the effect re-reads whenever it changes.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/mockups", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && data?.ok) {
          setItems(data.items as AccountMockup[]);
          setError(null);
        } else {
          setItems([]);
          setError(data?.error ?? "We couldn't fetch your designs. Please refresh the page.");
        }
      })
      .catch(() => {
        if (alive) {
          setItems([]);
          setError("We couldn't fetch your designs. Please refresh the page.");
        }
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const retry = () => {
    setItems(null);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  /** Remove one card after a successful delete/hide, and say so politely. */
  const onRemoved = (item: AccountMockup) => {
    setItems((prev) => (prev ? prev.filter((it) => it.id !== item.id) : prev));
    setAnnouncement(
      item.kind === "mockup" ? "Mockup deleted." : "Order request removed from your list. The shop still has it.",
    );
  };

  /** "Order again" adds a card server-side: refetch so the list reflects it. */
  const onListChanged = () => setReloadKey((k) => k + 1);

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
      <p role="status" className="text-text-2 animate-pulse text-sm" data-testid="designs-loading">
        Fetching your designs…
      </p>
    );
  }

  const mockups = items.filter((item) => item.kind === "mockup");
  const orders = items.filter((item) => item.kind === "order");

  return (
    <div className="flex flex-col gap-6">
      <Wallet />
      <p
        role="note"
        className="border-border bg-bg-2/60 text-text-2 rounded-xl border p-3 text-sm"
        data-testid="retention-banner"
      >
        Emailed mockups are kept for {MOCKUP_FILES_RETENTION_DAYS} days, then the images are deleted. Save the ones you
        want to keep.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Tabs defaultValue="mockups">
        <TabsList aria-label="Your designs" className="flex-wrap overflow-visible">
          <TabsTrigger value="mockups">Saved mockups ({mockups.length})</TabsTrigger>
          <TabsTrigger value="orders">Order requests ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="mockups">
          {mockups.length === 0 ? (
            <EmptyState kind="mockup" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mockups.map((item) => (
                <DesignCard
                  key={item.id}
                  item={item}
                  email={email}
                  onRemoved={onRemoved}
                  onListChanged={onListChanged}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders">
          {orders.length === 0 ? (
            <EmptyState kind="order" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orders.map((item) => (
                <DesignCard
                  key={item.id}
                  item={item}
                  email={email}
                  onRemoved={onRemoved}
                  onListChanged={onListChanged}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
