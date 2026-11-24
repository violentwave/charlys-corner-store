import * as React from "react";

import { cn } from "@/lib/cn";

export interface FormStatusProps {
  status: "success" | "error" | null;
  message?: string | null;
  className?: string;
}

export function FormStatus({ status, message, className }: FormStatusProps) {
  if (!status || !message) return null;
  const role = status === "success" ? "status" : "alert";
  const color = status === "success" ? "text-neon-green" : "text-danger";
  return (
    <div
      role={role}
      aria-live={status === "success" ? "polite" : "assertive"}
      className={cn("border-border bg-bg-2/60 rounded-md border px-4 py-3 text-sm", color, className)}
    >
      {message}
    </div>
  );
}
