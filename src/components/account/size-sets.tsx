"use client";
/**
 * The "Sizes & rosters" tab (docs/02 Member perks): saved size breakdowns and team
 * rosters, reused in the builder's order card and in "Order again". A set is a name, a
 * sizes grid, and an optional roster (one row per person: name, size, number) with a
 * "Fill sizes from roster" helper. Capped: MAX_SIZE_SETS sets, ROSTER_MAX rows.
 */
import { useEffect, useState } from "react";

import { combineSizesAndRoster, MAX_SIZE_SETS, ROSTER_MAX, sizesTotal } from "@/lib/member-schemas";
import type { SizeSet } from "@/lib/size-sets";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SizeGrid } from "@/components/forms/size-grid";
import { NETWORK_ERROR, postJson } from "@/components/forms/auth-post";

/** Every size the shop offers (any garment's list ⊆ this). */
const ALL_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "OSFA"];

type RosterRow = { name: string; size: string; number?: string };

export function SizeSets() {
  const [sets, setSets] = useState<SizeSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SizeSet | "new" | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const reload = () => {
    fetch("/api/account/size-sets", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { sizeSets?: SizeSet[]; error?: string } | null;
        if (res.ok && data?.sizeSets) {
          setSets(data.sizeSets);
          setError(null);
        } else {
          setError(data?.error ?? "We couldn't load your size sets. Please refresh the page.");
        }
      })
      .catch(() => setError("We couldn't load your size sets. Please refresh the page."));
  };

  useEffect(reload, []);

  const onDeleted = (id: string) => {
    setSets((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    setAnnouncement("Size set deleted.");
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
  if (sets === null) {
    return (
      <p role="status" className="text-text-2 animate-pulse text-sm" data-testid="size-sets-loading">
        Loading your size sets…
      </p>
    );
  }

  const atCap = sets.length >= MAX_SIZE_SETS;

  return (
    <div className="flex flex-col gap-6" data-testid="size-sets">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-2 text-sm">
          Team rosters and size breakdowns you can drop straight into an order. Saved sets show up in the builder and in
          &ldquo;Order again&rdquo;.
        </p>
        {!atCap ? (
          <Button type="button" onClick={() => setEditing("new")} data-testid="new-size-set">
            New size set
          </Button>
        ) : (
          <p role="note" className="text-text-3 text-xs" data-testid="size-sets-cap">
            You can keep {MAX_SIZE_SETS} saved size sets — delete one to make room.
          </p>
        )}
      </div>

      {sets.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <p className="font-heading text-text-1 text-lg tracking-wide uppercase" data-testid="size-sets-empty">
            No saved size sets yet
          </p>
          <p className="text-text-2 mx-auto mt-2 max-w-sm text-sm">
            Type up a team roster or a size breakdown once — we&apos;ll remember it for your next order.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {sets.map((set) => (
            <li key={set.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-text-1 text-sm font-medium" data-testid={`size-set-name-${set.id}`}>
                    {set.name}
                  </p>
                  <p className="text-text-3 text-xs" data-testid={`size-set-summary-${set.id}`}>
                    {sizesTotal(set.sizes)} pieces
                    {set.roster.length > 0 ? ` · ${set.roster.length} roster rows` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(set)}
                    data-testid={`edit-size-set-${set.id}`}
                  >
                    Edit
                  </Button>
                  <DeleteSizeSetButton set={set} onDeleted={onDeleted} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <SizeSetEditor
          set={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setAnnouncement("Size set saved.");
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function DeleteSizeSetButton({ set, onDeleted }: { set: SizeSet; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/size-sets/${set.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        setOpen(false);
        onDeleted(set.id);
        return;
      }
      setError(data?.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={() => setOpen(true)}
        data-testid={`delete-size-set-${set.id}`}
      >
        Delete
      </Button>
      {open ? (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent aria-describedby="delete-set-body">
            <p id="delete-set-body" className="text-text-2 text-sm">
              Delete &ldquo;{set.name}&rdquo;? You can type it up again, but it won&apos;t be here.
            </p>
            {error ? (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="bg-danger text-text-1 shadow-none hover:shadow-none"
                onClick={() => void remove()}
                loading={pending}
                data-testid="confirm-delete-size-set"
              >
                Delete
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function SizeSetEditor({ set, onClose, onSaved }: { set: SizeSet | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(set?.name ?? "");
  const [sizes, setSizes] = useState<Record<string, number>>(set?.sizes ?? {});
  const [roster, setRoster] = useState<RosterRow[]>(set?.roster ?? []);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const setRosterRow = (index: number, patch: Partial<RosterRow>) => {
    setRoster((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  /** The helper: the grid becomes each size's roster headcount. */
  const fillFromRoster = () => setSizes(combineSizesAndRoster({}, roster));

  const save = async () => {
    setPending(true);
    setError(null);
    setFieldErrors({});
    const body = {
      name: name.trim(),
      sizes: Object.fromEntries(Object.entries(sizes).filter(([, qty]) => qty > 0)),
      roster: roster
        .filter((row) => row.name.trim() && row.size)
        .map((row) => ({
          name: row.name.trim(),
          size: row.size,
          ...(row.number?.trim() ? { number: row.number.trim() } : {}),
        })),
    };
    const { data: res } = await postJson(
      set ? `/api/account/size-sets/${set.id}` : "/api/account/size-sets",
      body,
      set ? "PUT" : undefined,
    );
    setPending(false);
    if (res?.ok) {
      onSaved();
      return;
    }
    if (res && !res.ok && res.fieldErrors) setFieldErrors(res.fieldErrors);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-describedby="size-set-editor-note" className="max-h-[90dvh]" data-testid="size-set-editor">
        <p id="size-set-editor-note" className="text-text-2 text-sm">
          {set
            ? `Editing “${set.name}”.`
            : "Name it, fill the grid, and (optionally) type your roster — one row per person."}
        </p>

        <Field label="Name" required error={fieldErrors.name} controlId="size-set-name">
          <Input
            id="size-set-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fall fundraiser 2027"
            data-testid="size-set-name"
          />
        </Field>

        <SizeGrid
          sizes={ALL_SIZES}
          values={sizes}
          onChange={(size, qty) => setSizes((prev) => ({ ...prev, [size]: qty }))}
          idPrefix="size-set"
        />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-text-2 text-sm font-medium">
              Roster <span className="text-text-3 text-xs">(optional — one row per person)</span>
            </p>
            <button
              type="button"
              onClick={fillFromRoster}
              data-testid="fill-from-roster"
              className="text-neon-cyan focus-visible:ring-neon-cyan rounded-sm text-xs underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Fill sizes from roster
            </button>
          </div>

          {roster.map((row, index) => {
            const first = index === 0;
            const label = (base: string) => `${base} — roster row ${index + 1}`;
            return (
              <div key={index} className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  {first ? <span className="text-text-1 text-sm font-medium">Name</span> : null}
                  <Input
                    value={row.name}
                    maxLength={60}
                    onChange={(e) => setRosterRow(index, { name: e.target.value })}
                    aria-label={label("Name")}
                    className="h-9"
                    data-testid={`roster-name-${index}`}
                  />
                </div>
                <div className="flex w-28 flex-col gap-1.5">
                  {first ? <span className="text-text-1 text-sm font-medium">Size</span> : null}
                  <Select value={row.size} onValueChange={(size) => setRosterRow(index, { size })}>
                    <SelectTrigger className="h-9" aria-label={label("Size")}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_SIZES.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex w-20 flex-col gap-1.5">
                  {first ? <span className="text-text-1 text-sm font-medium">Number</span> : null}
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={row.number ?? ""}
                    onChange={(e) => setRosterRow(index, { number: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    aria-label={label("Number")}
                    className="h-9"
                    data-testid={`roster-number-${index}`}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove roster row ${index + 1}`}
                  onClick={() => setRoster((prev) => prev.filter((_, i) => i !== index))}
                  className="h-9"
                  data-testid={`roster-remove-${index}`}
                >
                  ×
                </Button>
              </div>
            );
          })}

          {roster.length < ROSTER_MAX ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() => setRoster((prev) => [...prev, { name: "", size: "", number: "" }])}
              data-testid="add-roster-row"
            >
              + Add a person
            </Button>
          ) : (
            <p role="note" className="text-text-3 text-xs">
              The roster holds {ROSTER_MAX} rows — that&apos;s the max.
            </p>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-danger text-sm" data-testid="size-set-error">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => void save()} loading={pending} data-testid="save-size-set">
            {set ? "Save changes" : "Save size set"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
