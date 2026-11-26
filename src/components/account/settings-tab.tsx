"use client";
/**
 * The Settings tab (docs/02 Member perks): the profile (name), the marketing-emails
 * switch (optimistic — rolls back on error), and the password (change, or set the first
 * one on a Google-only account). A password change signs the member out everywhere by
 * design — said plainly before submitting.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AUTH_CHANGED_EVENT } from "@/components/layout/account-link";
import type { AccountSecurity } from "@/lib/auth-schema";
import { changePasswordSchema, settingsSchema } from "@/lib/member-schemas";
import { PASSWORD_MIN } from "@/lib/auth-schema";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NETWORK_ERROR, postJson } from "@/components/forms/auth-post";

type AccountSettings = { email: string; name: string | null; marketingOptIn: boolean };

export function SettingsTab() {
  const router = useRouter();
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [security, setSecurity] = useState<AccountSecurity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/settings", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { settings?: AccountSettings } | null;
        if (alive && res.ok && data?.settings) setSettings(data.settings);
        else if (alive) setError("We couldn't load your settings. Please refresh the page.");
      })
      .catch(() => {
        if (alive) setError("We couldn't load your settings. Please refresh the page.");
      });
    fetch("/api/account/security", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { security?: AccountSecurity } | null;
        if (alive && res.ok && data?.security) setSecurity(data.security);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4">
        <p className="text-danger text-sm">{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => router.refresh()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!settings) {
    return (
      <p role="status" className="text-text-2 animate-pulse text-sm" data-testid="settings-loading">
        Loading your settings…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10" data-testid="settings-tab">
      <ProfileSection settings={settings} onSaved={(next) => setSettings({ ...settings, ...next })} />
      <PasswordSection
        hasPassword={security?.hasPassword ?? false}
        twoFactorMethod={security?.twoFactor.method ?? null}
      />
    </div>
  );
}

function ProfileSection({
  settings,
  onSaved,
}: {
  settings: AccountSettings;
  onSaved: (next: Partial<AccountSettings>) => void;
}) {
  const [name, setName] = useState(settings.name ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const saveName = async () => {
    const parsed = settingsSchema.safeParse({ name: name.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the name");
      return;
    }
    setPending(true);
    setError(null);
    const { data: res } = await postJson("/api/account/settings", parsed.data, "PATCH");
    setPending(false);
    if (res?.ok && res.settings) {
      onSaved(res.settings as AccountSettings);
      setSaved("Saved.");
      toast({ title: "Saved." });
      return;
    }
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  /** Optimistic switch: flips at once, rolls back if the server disagrees. */
  const setMarketing = async (optIn: boolean) => {
    const previous = settings.marketingOptIn;
    onSaved({ marketingOptIn: optIn });
    const { data: res } = await postJson("/api/account/settings", { marketingOptIn: optIn }, "PATCH");
    if (res?.ok) {
      toast({ title: optIn ? "You're on the list." : "No more marketing emails." });
      return;
    }
    onSaved({ marketingOptIn: previous });
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-profile">
      <h3 id="settings-profile" className="font-heading text-text-1 text-sm tracking-widest uppercase">
        Profile
      </h3>

      <div className="border-border bg-bg-2/60 flex flex-col gap-3 rounded-xl border p-4">
        <Field
          label="Your name"
          hint="Optional — we put it on your order requests."
          error={error ?? undefined}
          controlId="settings-name"
        >
          <Input
            id="settings-name"
            value={name}
            maxLength={100}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(null);
            }}
            data-testid="settings-name"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={() => void saveName()} loading={pending} data-testid="save-name">
            Save name
          </Button>
          {saved ? (
            <p role="status" className="text-neon-green text-sm" data-testid="name-saved">
              {saved}
            </p>
          ) : null}
        </div>
        <p className="text-text-3 text-xs">
          Email: <span className="text-text-2 font-mono">{settings.email}</span> (this is your sign-in — we can&apos;t
          change it yet; ask us).
        </p>
      </div>

      <div className="border-border bg-bg-2/60 flex items-start gap-3 rounded-xl border p-4">
        <Checkbox
          id="marketing-opt-in"
          data-testid="marketing-opt-in"
          className="mt-0.5"
          checked={settings.marketingOptIn}
          onCheckedChange={(checked) => void setMarketing(checked === true)}
        />
        <label htmlFor="marketing-opt-in" className="text-text-2 text-sm">
          Send me occasional deals and updates
          <span className="text-text-3 block text-xs">Uncheck anytime — it only affects our own emails.</span>
        </label>
      </div>
    </section>
  );
}

function PasswordSection({
  hasPassword,
  twoFactorMethod,
}: {
  hasPassword: boolean;
  twoFactorMethod: "totp" | "email" | null;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendCode = async () => {
    setError(null);
    const { data: res } = await postJson("/api/account/security/email/setup");
    if (res?.ok) {
      setCooldown(30);
      return;
    }
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  const submit = async () => {
    setError(null);
    setFieldErrors({});
    // Client-side rules first: the new password matches the shared schema and the confirm.
    const parsed = changePasswordSchema.safeParse({
      ...(hasPassword ? { currentPassword: current } : {}),
      ...(twoFactorMethod ? { code: code.trim() } : {}),
      newPassword: next,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFieldErrors({ [issue?.path[0] as string]: issue?.message ?? "Check the fields" });
      return;
    }
    if (next !== confirm) {
      setFieldErrors({ confirm: "The passwords don't match" });
      return;
    }
    setPending(true);
    const { data: res } = await postJson("/api/account/password", parsed.data);
    setPending(false);
    if (res?.ok && res.signedOut) {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      toast({ title: "Password changed.", description: "Sign in again with your new password." });
      router.replace("/login");
      return;
    }
    if (res && !res.ok && res.fieldErrors) setFieldErrors(res.fieldErrors);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-password">
      <h3 id="settings-password" className="font-heading text-text-1 text-sm tracking-widest uppercase">
        Password
      </h3>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="border-border bg-bg-2/60 flex flex-col gap-4 rounded-xl border p-4"
        noValidate
        data-testid="password-form"
      >
        {hasPassword ? (
          <Field
            label="Current password"
            required
            error={fieldErrors.currentPassword ?? undefined}
            controlId="password-current"
          >
            <Input
              id="password-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              data-testid="password-current"
            />
          </Field>
        ) : (
          <p className="text-text-2 text-sm" data-testid="no-password-note">
            You sign in with Google — set a password too, so you can always sign in without it.
          </p>
        )}

        {twoFactorMethod ? (
          <Field
            label={twoFactorMethod === "totp" ? "6-digit code from your app" : "6-digit code from your email"}
            required
            error={fieldErrors.code ?? undefined}
            controlId="password-code"
          >
            <div className="flex items-center gap-2">
              <Input
                id="password-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={9}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono"
                data-testid="password-code"
              />
              {twoFactorMethod === "email" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void sendCode()}
                  disabled={cooldown > 0}
                  data-testid="password-send-code"
                >
                  {cooldown > 0 ? `Sent (${cooldown}s)` : "Send me a code"}
                </Button>
              ) : null}
            </div>
          </Field>
        ) : null}

        <Field
          label={hasPassword ? "New password" : "New password"}
          required
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={fieldErrors.newPassword ?? undefined}
          controlId="password-new"
        >
          <Input
            id="password-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            data-testid="password-new"
          />
        </Field>

        <Field
          label="Confirm new password"
          required
          error={fieldErrors.confirm ?? undefined}
          controlId="password-confirm"
        >
          <Input
            id="password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            data-testid="password-confirm"
          />
        </Field>

        <p className="text-text-2 text-sm" role="note" data-testid="password-warning">
          You&apos;ll be signed out on all devices and sign in again with your new password
          {twoFactorMethod ? " (and your 2FA code)" : ""}.
        </p>

        {error ? (
          <p role="alert" className="text-danger text-sm" data-testid="password-error">
            {error}
          </p>
        ) : null}

        <div>
          <Button type="submit" loading={pending} data-testid="password-submit">
            {hasPassword ? "Change password" : "Set a password"}
          </Button>
        </div>
      </form>
    </section>
  );
}
