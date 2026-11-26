"use client";
/**
 * The one-time backup-codes screen (docs/02 Members v2). Shown right after two-step
 * sign-in turns on, and whenever new codes are made. The codes are shown ONCE: copy or
 * download them now. "Done" stays disabled until the checkbox confirms they're saved.
 */
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function BackupCodesPanel({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob(["Charly's Corner Store — backup codes (each works once)\n\n", codes.join("\n"), "\n"], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = downloadRef.current;
    if (link) {
      link.href = url;
      link.click();
    }
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="backup-codes">
      <p className="text-text-2 text-sm" role="note">
        These codes are your way in if you ever lose your phone. They are <strong>shown once</strong> — copy or download
        them now, and keep them somewhere safe. Each works a single time.
      </p>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="backup-codes-grid" aria-label="Backup codes">
        {codes.map((code) => (
          <li
            key={code}
            className="border-border bg-bg-3 text-text-1 rounded-md border px-2 py-2 text-center font-mono text-sm"
          >
            {code}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} data-testid="backup-codes-copy">
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={download} data-testid="backup-codes-download">
          Download .txt
        </Button>
        <a ref={downloadRef} download="charlys-backup-codes.txt" aria-hidden="true" tabIndex={-1} className="hidden" />
        <p role="status" aria-live="polite" className="text-neon-green text-xs" data-testid="backup-codes-copied">
          {copied ? "Copied to your clipboard." : ""}
        </p>
      </div>

      <div className="flex items-start gap-3 text-sm">
        <Checkbox
          id="backup-codes-saved"
          data-testid="backup-codes-saved"
          className="mt-0.5"
          checked={saved}
          onCheckedChange={(checked) => setSaved(checked === true)}
        />
        <label htmlFor="backup-codes-saved" className="text-text-2">
          I saved these codes somewhere safe.
        </label>
      </div>

      <div>
        <Button type="button" onClick={onDone} disabled={!saved} data-testid="backup-codes-done">
          Done
        </Button>
      </div>
    </div>
  );
}
