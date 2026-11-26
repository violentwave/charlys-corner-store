"use client";
/**
 * The layers list for the current side (docs/04 §3 v4): top layer first, each row a type
 * icon, a name and reorder/duplicate/delete icon buttons with aria-labels. The selected
 * row gets a left bar (not color-only). Rows are keyboard-reachable buttons.
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface LayersPanelProps {
  /** Top layer first. */
  rows: {
    id: string;
    type: "image" | "text";
    /** File name, or the first ~20 chars of the text. */
    name: string;
    /** Thumbnail for image layers (object URL). */
    thumbUrl?: string;
  }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, to: "up" | "down") => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

export function LayersPanel({ rows, selectedId, onSelect, onMove, onDuplicate, onRemove }: LayersPanelProps) {
  if (rows.length === 0) {
    return (
      <p className="text-text-3 text-sm" data-testid="layers-empty">
        Nothing on this side yet. Upload an image or add text.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1" data-testid="layers-panel">
      {rows.map((row, index) => {
        const selected = row.id === selectedId;
        const top = index === 0;
        return (
          <li key={row.id}>
            <div
              className={cn(
                "border-border bg-bg-3/50 focus-within:border-neon-cyan flex items-center gap-1 rounded-md border py-1 pr-1 pl-2",
                selected && "border-l-neon-pink border-l-4 pl-1.5",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                data-testid={`layer-select-${row.id}`}
                className={cn(
                  "focus-visible:ring-neon-cyan flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-left text-xs focus-visible:ring-2 focus-visible:outline-none",
                  selected ? "text-text-1" : "text-text-2",
                )}
                aria-pressed={selected}
              >
                {row.type === "image" && row.thumbUrl ? (
                  // Object URL of the in-memory file; next/image can't optimize blob: URLs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.thumbUrl} alt="" className="bg-builder-backdrop h-7 w-7 rounded object-contain" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-bg-2 text-text-1 flex h-7 w-7 items-center justify-center rounded font-serif text-xs font-bold"
                  >
                    T
                  </span>
                )}
                <span className="truncate">{row.name}</span>
                {selected ? <span className="sr-only">(selected)</span> : null}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 min-w-0 px-0"
                aria-label={top ? `Move ${row.name} down` : `Move ${row.name} up`}
                onClick={() => onMove(row.id, top ? "down" : "up")}
                data-testid={`layer-move-${row.id}`}
                disabled={rows.length < 2}
              >
                {top ? "↓" : "↑"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 min-w-0 px-0"
                aria-label={`Duplicate ${row.name}`}
                onClick={() => onDuplicate(row.id)}
                data-testid={`layer-duplicate-${row.id}`}
              >
                ⧉
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger h-8 w-8 min-w-0 px-0"
                aria-label={`Delete ${row.name}`}
                onClick={() => onRemove(row.id)}
                data-testid={`layer-delete-${row.id}`}
              >
                ×
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
