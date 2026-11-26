"use client";
/**
 * The account gate shown when a signed-out or unverified visitor tries to upload artwork
 * (docs/04 Flow v2: account before upload). Everything happens right here in the dialog:
 * create an account (or log in) → enter the 6-digit code → "Add my design". The visitor
 * never leaves the builder, so nothing about their design is lost and there's no second
 * login. The standalone /signup, /login and /verify pages reuse the same forms.
 */
import { useState } from "react";

import { LoginForm } from "@/components/forms/login-form";
import { SignupForm } from "@/components/forms/signup-form";
import { VerifyForm } from "@/components/forms/verify-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AccountUser } from "@/lib/auth-schema";

export type SignInDialogMode = "signedOut" | "unverified" | null;

type Step = "signup" | "login" | "verify" | "done";

const TITLES: Record<Step, string> = {
  signup: "Create a free account",
  login: "Welcome back",
  verify: "Check your email",
  done: "You're in!",
};

const BLURBS: Record<Step, string> = {
  signup: "One quick account saves your designs and unlocks your mockup + 15% off your 2nd order.",
  login: "Log in to add your design. Your garment and colors are still right here.",
  verify: "Enter the 6-digit code we just emailed you. This only happens once.",
  done: "Your account is ready. Let's put your design on it.",
};

export interface SignInDialogProps {
  mode: SignInDialogMode;
  /** The account's email when it exists but isn't verified yet (mode "unverified"). */
  email?: string | null;
  onClose: () => void;
  /** Called whenever the account state changes (signed up, logged in, verified). */
  onAccount: (user: AccountUser) => void;
  /** "Add my design": the parent closes the dialog and opens the file picker. */
  onContinue: () => void;
}

export function SignInDialog(props: SignInDialogProps) {
  const open = props.mode !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && props.onClose()}>
      {open ? (
        // Keyed on mode so each opening starts at the right step with empty forms.
        <SignInDialogBody key={props.mode} {...props} />
      ) : null}
    </Dialog>
  );
}

function SignInDialogBody({ mode, email: initialEmail, onAccount, onContinue }: SignInDialogProps) {
  const [step, setStep] = useState<Step>(mode === "unverified" ? "verify" : "signup");
  const [email, setEmail] = useState<string>(initialEmail ?? "");

  const signedIn = (user: AccountUser) => {
    setEmail(user.email);
    onAccount(user);
    setStep(user.verified ? "done" : "verify");
  };

  const verified = () => {
    onAccount({ email, name: null, verified: true });
    setStep("done");
  };

  return (
    <DialogContent
      aria-describedby="sign-in-why"
      data-testid="sign-in-dialog"
      className="max-h-[90dvh] overflow-y-auto"
    >
      {step === "signup" || step === "login" ? (
        <div role="tablist" aria-label="Account" className="bg-bg-2 flex gap-1 self-start rounded-full p-1">
          {(["signup", "login"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={step === tab}
              data-testid={`dialog-tab-${tab}`}
              onClick={() => setStep(tab)}
              className={
                step === tab
                  ? "bg-neon-pink text-bg-0 focus-visible:ring-neon-cyan min-h-11 rounded-full px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
                  : "text-text-2 hover:text-text-1 focus-visible:ring-neon-cyan min-h-11 rounded-full px-4 text-sm focus-visible:ring-2 focus-visible:outline-none"
              }
            >
              {tab === "signup" ? "New here" : "I have an account"}
            </button>
          ))}
        </div>
      ) : null}

      <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">
        {TITLES[step]}
      </DialogTitle>
      <DialogDescription id="sign-in-why" className="text-text-2 text-sm">
        {BLURBS[step]}
      </DialogDescription>

      {step === "signup" ? <SignupForm next="/" onDone={signedIn} onSwitchToLogin={() => setStep("login")} /> : null}
      {step === "login" ? <LoginForm next="/" onDone={signedIn} onSwitchToSignup={() => setStep("signup")} /> : null}
      {step === "verify" ? <VerifyForm next="/" email={email} onDone={verified} /> : null}
      {step === "done" ? (
        <Button onClick={onContinue} data-testid="dialog-add-design" className="self-start">
          Add my design
        </Button>
      ) : null}
    </DialogContent>
  );
}
