"use client";
/**
 * The Security tab of /account (docs/02 Members v2): sign-in methods (password, Google),
 * two-step sign-in (authenticator app / code by email + backup codes), and the delete
 * account danger zone. Every sensitive change re-confirms the member first
 * (ConfirmDialog: password when set + a 2FA code when on); the server re-checks.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BackupCodesPanel } from "./backup-codes-panel";
import { ConfirmDialog } from "./confirm-dialog";
import { AUTH_CHANGED_EVENT } from "@/components/layout/account-link";
import { toast } from "@/components/ui/toast";
import type { AccountSecurity } from "@/lib/auth-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NETWORK_ERROR, postJson } from "@/components/forms/auth-post";

type ConfirmKind = "unlink-google" | "new-backup-codes" | "turn-off-2fa" | "delete-account";

const METHOD_LABELS: Record<"totp" | "email", string> = {
  totp: "Authenticator app",
  email: "Code by email",
};

export function SecuritySettings({ email }: { email: string }) {
  const router = useRouter();
  const [security, setSecurity] = useState<AccountSecurity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // TOTP setup: the pending QR + key from /totp/setup, and the typed code.
  const [totpSetup, setTotpSetup] = useState<{ qrSvg: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  // Email setup: the code was sent (setup), and the typed code.
  const [emailSetup, setEmailSetup] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [setupCode, setSetupCode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  // The one-time backup-codes screen (after enabling, or making new codes).
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/security", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { security?: AccountSecurity; error?: string } | null;
        if (!alive) return;
        if (res.ok && data?.security) {
          setSecurity(data.security);
          setError(null);
        } else {
          setError(data?.error ?? "We couldn't load your security settings. Please refresh the page.");
        }
      })
      .catch(() => {
        if (alive) setError("We couldn't load your security settings. Please refresh the page.");
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Cooldown for the emailed setup code ("Send me a new code" on the email setup panel).
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = window.setInterval(() => setEmailCooldown((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [emailCooldown]);

  const refetch = () => setReloadKey((k) => k + 1);

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4">
        <p className="text-danger text-sm">{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }
  if (!security) {
    return (
      <p role="status" className="text-text-2 animate-pulse text-sm" data-testid="security-loading">
        Loading your security settings…
      </p>
    );
  }

  const startTotpSetup = async () => {
    setSetupError(null);
    const { data: res } = await postJson("/api/account/security/totp/setup");
    if (res?.ok && typeof res.qrSvg === "string" && typeof res.secret === "string") {
      setTotpSetup({ qrSvg: res.qrSvg, secret: res.secret });
      return;
    }
    setSetupError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  const startEmailSetup = async () => {
    setSetupError(null);
    const { data: res } = await postJson("/api/account/security/email/setup");
    if (res?.ok) {
      setEmailSetup(true);
      setEmailCooldown(30);
      return;
    }
    setSetupError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  const enableTotp = async () => {
    setSetupError(null);
    const { data: res } = await postJson("/api/account/security/totp/enable", { code: totpCode.trim() });
    if (res?.ok && Array.isArray(res.backupCodes)) {
      setTotpSetup(null);
      setTotpCode("");
      setBackupCodes(res.backupCodes as string[]);
      return;
    }
    setSetupError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  const enableEmail = async () => {
    setSetupError(null);
    const { data: res } = await postJson("/api/account/security/email/enable", { code: setupCode.trim() });
    if (res?.ok && Array.isArray(res.backupCodes)) {
      setEmailSetup(false);
      setSetupCode("");
      setBackupCodes(res.backupCodes as string[]);
      return;
    }
    setSetupError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  /** Per-kind confirm-dialog wiring (copy + endpoint + success). */
  const confirmProps = ((): {
    title: string;
    body: string;
    actionLabel: string;
    danger: boolean;
    confirmWord: boolean;
    endpoint: string;
    onSuccess: (res: { ok: true } & Record<string, unknown>) => void;
  } | null => {
    switch (confirmKind) {
      case "unlink-google":
        return {
          title: "Disconnect Google?",
          body: "You'll sign in with your email and password instead.",
          actionLabel: "Disconnect",
          danger: false,
          confirmWord: false,
          endpoint: "/api/account/security/google/unlink",
          onSuccess: () => {
            setConfirmKind(null);
            setAnnouncement("Google disconnected.");
            toast({ title: "Google disconnected." });
            refetch();
          },
        };
      case "new-backup-codes":
        return {
          title: "Make new backup codes?",
          body: "Your current backup codes stop working the moment the new ones are made.",
          actionLabel: "Make new codes",
          danger: false,
          confirmWord: false,
          endpoint: "/api/account/security/backup-codes",
          onSuccess: (res) => {
            setConfirmKind(null);
            if (Array.isArray(res.backupCodes)) setBackupCodes(res.backupCodes as string[]);
          },
        };
      case "turn-off-2fa":
        return {
          title: "Turn off two-step sign-in?",
          body: "Your account will then be protected by your password only.",
          actionLabel: "Turn off",
          danger: true,
          confirmWord: false,
          endpoint: "/api/account/security/disable",
          onSuccess: () => {
            setConfirmKind(null);
            setAnnouncement("Two-step sign-in is off.");
            toast({ title: "Two-step sign-in is off." });
            refetch();
          },
        };
      case "delete-account":
        return {
          title: "Delete your account?",
          body: "Your account, saved mockups and their files are deleted for good. Order requests stay with the shop.",
          actionLabel: "Delete my account",
          danger: true,
          confirmWord: true,
          endpoint: "/api/account/delete",
          onSuccess: () => {
            setConfirmKind(null);
            window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
            toast({ title: "Your account is deleted.", description: "Sorry to see you go 🐾" });
            router.replace("/");
            router.refresh();
          },
        };
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-col gap-10" data-testid="security-settings">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <section className="flex flex-col gap-4" aria-labelledby="security-methods">
        <h3 id="security-methods" className="font-heading text-text-1 text-sm tracking-widest uppercase">
          Sign-in methods
        </h3>

        <div className="border-border bg-bg-2/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div className="flex flex-col gap-1">
            <p className="text-text-1 text-sm font-medium">Password</p>
            <p className="text-text-3 text-xs" data-testid="password-status">
              {security.hasPassword ? "Set" : "No password yet"}
            </p>
          </div>
          {security.hasPassword ? (
            <p className="text-text-3 text-xs">Keep it somewhere safe.</p>
          ) : (
            <Button asChild size="sm" data-testid="set-password">
              <a href={`/forgot-password?email=${encodeURIComponent(email)}`}>Set a password</a>
            </Button>
          )}
        </div>

        {security.google.available ? (
          <div className="border-border bg-bg-2/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div className="flex flex-col gap-1">
              <p className="text-text-1 text-sm font-medium">Google</p>
              <p className="text-text-3 text-xs" data-testid="google-status">
                {security.google.linked ? "Connected" : "Not connected"}
              </p>
            </div>
            {security.google.linked ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmKind("unlink-google")}
                data-testid="google-disconnect"
              >
                Disconnect
              </Button>
            ) : (
              <Button asChild size="sm" data-testid="google-connect">
                <a href={`/api/auth/google/start?next=${encodeURIComponent("/account#security")}`}>Connect Google</a>
              </Button>
            )}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="security-2fa">
        <h3 id="security-2fa" className="font-heading text-text-1 text-sm tracking-widest uppercase">
          Two-step sign-in
        </h3>

        {security.twoFactor.method ? (
          <div
            className="border-border bg-bg-2/60 flex flex-col gap-4 rounded-xl border p-4"
            data-testid="twofactor-on"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-text-1 text-sm font-medium">On — {METHOD_LABELS[security.twoFactor.method]}</p>
                <p className="text-text-3 text-xs" data-testid="backup-codes-left">
                  Backup codes left: {security.twoFactor.recoveryCodesLeft}
                </p>
              </div>
              {security.twoFactor.recoveryCodesLeft <= 3 ? (
                <p
                  role="status"
                  className="text-text-2 flex items-center gap-1.5 text-xs"
                  data-testid="backup-codes-low"
                >
                  <span aria-hidden="true">⚠</span> Running low — make new ones.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmKind("new-backup-codes")}
                data-testid="new-backup-codes"
              >
                Make new backup codes
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmKind("turn-off-2fa")}
                data-testid="turn-off-2fa"
              >
                Turn off
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="twofactor-off">
            <div className="border-border bg-bg-2/60 flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-col gap-1">
                <p className="text-text-1 text-sm font-medium">Authenticator app</p>
                <p className="text-text-3 text-xs">
                  Recommended. Codes in an app like Google Authenticator — works offline.
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => void startTotpSetup()} data-testid="setup-totp">
                Set up
              </Button>
            </div>
            <div className="border-border bg-bg-2/60 flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-col gap-1">
                <p className="text-text-1 text-sm font-medium">Code by email</p>
                <p className="text-text-3 text-xs">We email you a 6-digit code every time you sign in.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void startEmailSetup()}
                data-testid="setup-email"
              >
                Set up
              </Button>
            </div>
          </div>
        )}

        {totpSetup ? (
          <div
            className="border-neon-cyan/40 flex flex-col gap-3 rounded-xl border border-dashed p-4"
            data-testid="totp-setup"
          >
            <p className="text-text-2 text-sm">
              Scan this with your authenticator app (Google Authenticator, Authy, 1Password…).
            </p>
            <div
              role="img"
              aria-label="QR code for your authenticator app"
              className="bg-bg-1 self-start rounded-xl border p-3 [&_svg]:h-40 [&_svg]:w-40"
              data-testid="totp-qr"
              // The QR is an SVG string the server's `qrcode` lib rendered from the pending secret.
              dangerouslySetInnerHTML={{ __html: totpSetup.qrSvg }}
            />
            <div className="flex flex-col gap-1">
              <p className="text-text-2 text-xs">Can&apos;t scan? Enter this key in your app instead.</p>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  className="border-border bg-bg-3 rounded-md border px-3 py-2 font-mono text-sm"
                  data-testid="totp-secret"
                >
                  {totpSetup.secret}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(totpSetup.secret.replace(/\s/g, ""))}
                  data-testid="totp-secret-copy"
                >
                  Copy
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="totp-code" className="text-text-2 text-sm">
                Then enter the 6-digit code:
              </label>
              <Input
                id="totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-36 font-mono"
                data-testid="totp-code"
              />
              <Button type="button" size="sm" onClick={() => void enableTotp()} data-testid="totp-enable">
                Turn on
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTotpSetup(null);
                  setTotpCode("");
                }}
              >
                Cancel
              </Button>
            </div>
            {setupError ? (
              <p role="alert" className="text-danger text-sm">
                {setupError}
              </p>
            ) : null}
          </div>
        ) : null}

        {emailSetup ? (
          <div
            className="border-neon-cyan/40 flex flex-col gap-3 rounded-xl border border-dashed p-4"
            data-testid="email-setup"
          >
            <p className="text-text-2 text-sm" data-testid="email-setup-note">
              We emailed a 6-digit code to <span className="text-text-1 font-medium">{email}</span>. Enter it to turn
              two-step sign-in on.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-36 font-mono"
                aria-label="6-digit code from your email"
                data-testid="email-setup-code"
              />
              <Button type="button" size="sm" onClick={() => void enableEmail()} data-testid="email-enable">
                Turn on
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void startEmailSetup()}
                disabled={emailCooldown > 0}
                data-testid="email-setup-resend"
              >
                {emailCooldown > 0 ? `Send a new code (${emailCooldown}s)` : "Send me a new code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEmailSetup(false);
                  setSetupCode("");
                }}
              >
                Cancel
              </Button>
            </div>
            {setupError ? (
              <p role="alert" className="text-danger text-sm">
                {setupError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        className="border-danger/40 flex flex-col gap-3 rounded-xl border border-dashed p-4"
        aria-labelledby="security-danger"
      >
        <h3 id="security-danger" className="text-danger font-heading text-sm tracking-widest uppercase">
          Delete account
        </h3>
        <p className="text-text-2 text-sm">
          This deletes your account, your saved mockups and their files, for good. Order requests stay with the shop —
          we keep working on them.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-danger border-danger hover:border-danger w-fit"
          onClick={() => setConfirmKind("delete-account")}
          data-testid="delete-account"
        >
          Delete my account
        </Button>
      </section>

      {backupCodes ? (
        <section aria-labelledby="security-backup-codes" className="flex flex-col gap-3">
          <h3 id="security-backup-codes" className="font-heading text-text-1 text-sm tracking-widest uppercase">
            Your new backup codes
          </h3>
          <BackupCodesPanel
            codes={backupCodes}
            onDone={() => {
              setBackupCodes(null);
              setAnnouncement("Backup codes are ready.");
              refetch();
            }}
          />
        </section>
      ) : null}

      {confirmKind && confirmProps ? (
        <ConfirmDialog
          open
          onClose={() => setConfirmKind(null)}
          title={confirmProps.title}
          body={confirmProps.body}
          actionLabel={confirmProps.actionLabel}
          danger={confirmProps.danger}
          confirmWord={confirmProps.confirmWord}
          hasPassword={security.hasPassword}
          twoFactorMethod={security.twoFactor.method}
          endpoint={confirmProps.endpoint}
          onSuccess={confirmProps.onSuccess}
        />
      ) : null}
    </div>
  );
}
