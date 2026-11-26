"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { AccountMockup } from "@/app/api/account/mockups/route";
import { MOCKUP_FILES_RETENTION_DAYS } from "@/lib/retention";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function DesignCard({ item }: { item: AccountMockup }) {
  const status = STATUS_LABELS[item.status];
  return (
    <Card className="flex flex-col gap-4">
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
        </ul>
      </div>

      <div className="mt-auto">
        <Button asChild variant="secondary" size="sm">
          <Link href={item.restorePath}>Open in builder</Link>
        </Button>
      </div>
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

export function MyDesigns() {
  const [items, setItems] = useState<AccountMockup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    <Tabs defaultValue="mockups">
      <TabsList aria-label="Your designs">
        <TabsTrigger value="mockups">Saved mockups ({mockups.length})</TabsTrigger>
        <TabsTrigger value="orders">Order requests ({orders.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="mockups">
        {mockups.length === 0 ? (
          <EmptyState kind="mockup" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mockups.map((item) => (
              <DesignCard key={item.id} item={item} />
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
              <DesignCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
