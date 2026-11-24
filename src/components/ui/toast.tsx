"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";

import { cn } from "@/lib/cn";

type ToastVariant = "default" | "success" | "error";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastOptions {
  id: string;
}

const TOAST_EVENT = "charly-toast";

export function toast(options: ToastOptions = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: options }));
}

const icons: Record<ToastVariant, React.ReactNode> = {
  default: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  ),
  success: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  ),
};

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border text-text-1",
  success: "border-neon-green text-neon-green",
  error: "border-danger text-danger",
};

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToastOptions>).detail ?? {};
      counter.current += 1;
      setToasts((prev) => [...prev, { id: `toast-${counter.current}`, variant: "default", ...detail }]);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  const remove = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastPrimitive.Provider duration={5000} swipeDirection="right">
      {toasts.map((t) => {
        const variant = t.variant ?? "default";
        return (
          <ToastPrimitive.Root
            key={t.id}
            duration={5000}
            type={variant === "error" ? "foreground" : "background"}
            onOpenChange={(open) => {
              if (!open) remove(t.id);
            }}
            className={cn(
              "bg-bg-2/95 shadow-glow-cyan grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border p-4 backdrop-blur-md transition-all duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
              variantClasses[variant],
            )}
          >
            <span className="mt-0.5">{icons[variant]}</span>
            <div className="flex flex-col gap-1">
              {t.title ? (
                <ToastPrimitive.Title className="text-text-1 text-sm font-semibold">{t.title}</ToastPrimitive.Title>
              ) : null}
              {t.description ? (
                <ToastPrimitive.Description className="text-text-2 text-sm">{t.description}</ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss notification"
              className="text-text-2 hover:bg-bg-3 hover:text-text-1 focus-visible:ring-neon-cyan inline-flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span aria-hidden="true">×</span>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed right-4 bottom-4 left-4 z-[100] flex flex-col gap-2 outline-none sm:left-auto sm:w-full sm:max-w-sm" />
    </ToastPrimitive.Provider>
  );
}
