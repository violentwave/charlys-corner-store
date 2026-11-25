"use client";
/**
 * The gate shown when a signed-out or unverified visitor tries to upload artwork
 * (docs/04 Flow v2: account before upload). The design state persists in sessionStorage,
 * so after signup/verify/login the visitor lands back on the builder at the Design step.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type SignInDialogMode = "signedOut" | "unverified" | null;

const WHY = "Your designs are saved, and your mockup comes with 15% off your 2nd order.";

/** Same-site `next` target that returns the visitor to this exact builder URL. */
function builderNext(): string {
  if (typeof window === "undefined") return "/design";
  return `${window.location.pathname}${window.location.search}`;
}

export function SignInDialog({ mode, onClose }: { mode: SignInDialogMode; onClose: () => void }) {
  const next = builderNext();
  const nextParam = encodeURIComponent(next);
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      {mode !== null ? (
        <DialogContent aria-describedby="sign-in-why" data-testid="sign-in-dialog">
          <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
            {mode === "signedOut"
              ? "Create a free account to add your design"
              : "Confirm your email to add your design"}
          </DialogTitle>
          <DialogDescription id="sign-in-why" className="text-text-2 text-sm">
            {WHY}
          </DialogDescription>
          <div className="flex flex-col gap-2 sm:flex-row">
            {mode === "signedOut" ? (
              <>
                <Button asChild data-testid="dialog-signup">
                  <Link href={`/signup?next=${nextParam}`}>Create account</Link>
                </Button>
                <Button asChild variant="secondary" data-testid="dialog-login">
                  <Link href={`/login?next=${nextParam}`}>Log in</Link>
                </Button>
              </>
            ) : (
              <Button asChild data-testid="dialog-verify">
                <Link href={`/verify?next=${nextParam}`}>Confirm my email</Link>
              </Button>
            )}
          </div>
          <p className="text-text-3 text-xs" role="note">
            Takes about a minute. When you get back, your garment and colors are right here waiting.
          </p>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
