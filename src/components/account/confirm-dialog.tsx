"use client";
/**
 * The "are you sure" dialog before a sensitive change (docs/02 Members v2): asks for the
 * password when the account has one, and a second-factor code when 2FA is on (email 2FA
 * gets a "Send me a code" button). The server re-checks everything; its `fieldErrors`
 * land on the fields.
 */
import { useEffect, useState } from "react";

import { AUTH_CHANGED_EVENT } from "@/components/layout/account-link";
import { confirmIdentitySchema, deleteAccountSchema } from "@/lib/auth-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { NETWORK_ERROR, postJson } from "@/components/forms/auth-post";

const RESEND_COOLDOWN_SECONDS = 30;

export type ConfirmIdentityRequest = {
  password?: string;
  code?: string;
};

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  actionLabel: string;
  /** Red actions for destructive steps (delete account, turn off). */
  danger?: boolean;
  hasPassword: boolean;
  twoFactorMethod: "totp" | "email" | null;
  /** The endpoint gets `password` and/or `code` — exactly what the schema allows. */
  endpoint: string;
  /** When true, the member must type DELETE (delete-account flow, deleteAccountSchema). */
  confirmWord?: boolean;
  /** Runs after an `{ ok: true }` answer (the response carries extras like `backupCodes`). */
  onSuccess: (res: { ok: true } & Record<string, unknown>) => void;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  actionLabel,
  danger = false,
  hasPassword,
  twoFactorMethod,
  endpoint,
  confirmWord = false,
  onSuccess,
}: ConfirmDialogProps) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Fresh fields on every opening — adjusted during render (react.dev), not in an effect.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setPassword("");
      setCode("");
      setConfirm("");
      setError(null);
      setFieldError(null);
      setCooldown(0);
    }
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendEmailCode = async () => {
    setError(null);
    const { data: res } = await postJson("/api/account/security/email/setup");
    if (res?.ok) {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setError("We emailed you a code."); // reuse the error line as a status (it's the only line)
      return;
    }
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  const submit = async () => {
    // The shared schema is the truth: password optional (only when the account has one),
    // code optional (only when 2FA is on), and `confirm: "DELETE"` for account deletion —
    // the delete schema keeps the `confirm` key (the plain identity schema would strip it).
    if (confirmWord && confirm.trim() !== "DELETE") {
      setFieldError("Type DELETE to confirm");
      return;
    }
    const schema = confirmWord ? deleteAccountSchema : confirmIdentitySchema;
    const parsed = schema.safeParse({
      ...(hasPassword ? { password } : {}),
      ...(twoFactorMethod ? { code } : {}),
      ...(confirmWord ? { confirm: "DELETE" } : {}),
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check the fields");
      return;
    }
    setPending(true);
    setError(null);
    setFieldError(null);
    const { data: res } = await postJson(endpoint, parsed.data);
    setPending(false);
    if (res?.ok) {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      onSuccess(res);
      return;
    }
    setFieldError(res && !res.ok && res.fieldErrors ? (Object.values(res.fieldErrors)[0] ?? null) : null);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open ? (
        <DialogContent aria-describedby="confirm-dialog-body">
          <DialogTitle className="font-heading text-text-1 pr-6 text-lg tracking-wide uppercase">{title}</DialogTitle>
          <DialogDescription id="confirm-dialog-body" className="text-text-2 text-sm">
            {body}
          </DialogDescription>

          <div className="flex flex-col gap-4">
            {hasPassword ? (
              <Field label="Your password" required error={fieldError ?? undefined} controlId="confirm-password">
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="confirm-password"
                />
              </Field>
            ) : null}

            {twoFactorMethod ? (
              <Field
                label={twoFactorMethod === "totp" ? "6-digit code from your app" : "6-digit code from your email"}
                required
                error={fieldError ?? undefined}
                controlId="confirm-code"
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="confirm-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={9}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="font-mono"
                    data-testid="confirm-code"
                  />
                  {twoFactorMethod === "email" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void sendEmailCode()}
                      disabled={cooldown > 0}
                      data-testid="confirm-send-code"
                    >
                      {cooldown > 0 ? `Sent (${cooldown}s)` : "Send me a code"}
                    </Button>
                  ) : null}
                </div>
              </Field>
            ) : null}

            {confirmWord ? (
              <Field label='Type "DELETE" to confirm' required error={fieldError ?? undefined} controlId="confirm-word">
                <Input
                  id="confirm-word"
                  type="text"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="off"
                  data-testid="confirm-word"
                />
              </Field>
            ) : null}

            {error ? (
              <p
                role={error.startsWith("We emailed") ? "status" : "alert"}
                className={error.startsWith("We emailed") ? "text-neon-green text-sm" : "text-danger text-sm"}
                data-testid="confirm-status"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={danger ? "primary" : "primary"}
                onClick={() => void submit()}
                loading={pending}
                data-testid="confirm-action"
                className={danger ? "bg-danger text-text-1 shadow-none hover:shadow-none" : undefined}
              >
                {actionLabel}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose} data-testid="confirm-cancel">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
