"use client";

import * as React from "react";

import { site } from "@/lib/site";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface TurnstileProps {
  onToken: (token: string | null) => void;
  resetKey?: number;
  className?: string;
}

export const Turnstile = React.forwardRef<{ reset: () => void }, TurnstileProps>(
  ({ onToken, resetKey, className }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const widgetIdRef = React.useRef<string | null>(null);
    const [ready, setReady] = React.useState(false);
    const [token, setToken] = React.useState<string | null>(null);
    const [loadError, setLoadError] = React.useState(false);

    React.useEffect(() => {
      if (typeof window === "undefined") return;
      if (window.turnstile) {
        setReady(true);
        return;
      }
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        const interval = window.setInterval(() => {
          if (window.turnstile) {
            setReady(true);
            window.clearInterval(interval);
          }
        }, 50);
        return () => window.clearInterval(interval);
      }
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => setReady(true);
      script.onerror = () => setLoadError(true);
      document.head.appendChild(script);
    }, []);

    React.useEffect(() => {
      if (!ready || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        theme: "dark",
        callback: (value: string) => {
          setToken(value);
          onToken(value);
        },
        "expired-callback": () => {
          setToken(null);
          onToken(null);
        },
        "error-callback": () => {
          setToken(null);
          onToken(null);
          setLoadError(true);
        },
      });
      return () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // ignore
          }
          widgetIdRef.current = null;
        }
      };
    }, [ready, onToken]);

    React.useEffect(() => {
      if (resetKey === undefined) return;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setToken(null);
        onToken(null);
      }
    }, [resetKey, onToken]);

    React.useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          onToken(null);
        }
      },
    }));

    return (
      <>
        <input type="hidden" data-testid="turnstile-token" value={token ?? ""} readOnly />
        <div
          ref={containerRef}
          role="region"
          aria-label="Anti-spam verification"
          className={className ?? "min-h-[65px]"}
        />
        {loadError ? (
          <p role="alert" className="text-danger text-sm">
            The anti-spam check couldn&apos;t load. Try turning off ad blockers and reloading, or email us at{" "}
            {site.email.toLowerCase()}.
          </p>
        ) : null}
      </>
    );
  },
);
Turnstile.displayName = "Turnstile";
