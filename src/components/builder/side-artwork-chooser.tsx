"use client";
/**
 * The empty-side chooser (docs/04 "Artwork per side"): when the visitor switches to a
 * side with no art after uploading at least one file, offer "Use the same design" (with
 * a small thumbnail chooser when several files exist) and "Upload a different design".
 * Leaving the side blank is simply doing nothing.
 */
import { Button } from "@/components/ui/button";

export interface SideArtworkChooserProps {
  /** The uploaded files, oldest first: `{ index }` is the builder's file index. */
  files: { index: number; url: string; name: string }[];
  /** The side currently shown (for the copy). */
  sideLabel: string;
  onUse: (fileIndex: number) => void;
  onUploadDifferent: () => void;
}

export function SideArtworkChooser({ files, sideLabel, onUse, onUploadDifferent }: SideArtworkChooserProps) {
  return (
    <div className="bg-bg-2/60 border-border flex flex-col gap-2 rounded-xl border p-3" data-testid="side-chooser">
      <p className="text-text-1 text-sm font-medium">
        {files.length === 1 ? "Use the same design" : "Use one of your designs"}
      </p>
      <p className="text-text-3 text-xs">
        Put an uploaded design on the {sideLabel.toLowerCase()} too — or leave this side blank.
      </p>
      <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <button
            key={file.index}
            type="button"
            onClick={() => onUse(file.index)}
            data-testid={`use-design-${file.index}`}
            className="border-border bg-bg-3 hover:border-neon-cyan focus-visible:ring-neon-cyan flex min-h-11 items-center gap-2 rounded-lg border p-1.5 pr-3 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {/* Object URL of the in-memory file; next/image can't optimize blob: URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.url} alt="" className="bg-builder-backdrop h-9 w-9 rounded-md object-contain" />
            <span className="text-text-1 max-w-32 truncate">{file.name}</span>
            <span className="sr-only">— use on this side</span>
          </button>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onUploadDifferent}
          data-testid="upload-different"
          className="self-center"
        >
          Upload a different design
        </Button>
      </div>
    </div>
  );
}
