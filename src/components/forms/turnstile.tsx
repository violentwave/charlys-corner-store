"use client";

import * as React from "react";

import { site } from "@/lib/site";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => string | undefined;
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
    // v4 (one-page Home): the widget renders only when its form scrolls near the viewport
    // (or gets focus), so four forms on one page don't load four widgets up front.
    const [nearViewport, setNearViewport] = React.useState(false);

    React.useEffect(() => {
      const container = containerRef.current;
      if (!container || nearViewport) return;
      if (typeof IntersectionObserver === "undefined") {
        setNearViewport(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) setNearViewport(true);
        },
        { rootMargin: "200px" },
      );
      observer.observe(container);
      // Focusing anything in the form also wakes the widget: a keyboard user who tabs
      // straight to a field renders the check before they reach the submit button.
      const form = container.closest("form") ?? container;
      const focusIn = () => setNearViewport(true);
      form.addEventListener("focusin", focusIn);
      return () => {
        observer.disconnect();
        form.removeEventListener("focusin", focusIn);
      };
    }, [nearViewport]);

    React.useEffect(() => {
      if (typeof window === "undefined") return;
      if (!nearViewport) return;
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
    }, [nearViewport]);

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
          data-testid="turnstile"
          data-turnstile-state={loadError ? "error" : token ? "solved" : nearViewport ? "ready" : "deferred"}
        >
          {nearViewport ? null : (
            <p className="text-text-3 min-h-[65px] content-center text-xs" data-testid="turnstile-deferred">
              Anti-spam check loads here.
            </p>
          )}
        </div>
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
