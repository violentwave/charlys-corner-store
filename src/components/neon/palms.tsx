import * as React from "react";

import { cn } from "@/lib/cn";

export interface PalmSilhouetteProps {
  className?: string;
  side?: "left" | "right";
}

export function PalmSilhouette({ className, side = "left" }: PalmSilhouetteProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 320"
      className={cn("text-text-3/60 h-48 w-32", side === "right" && "scale-x-[-1]", className)}
      fill="currentColor"
    >
      {/* trunk */}
      <path d="M95 320 C90 260 88 200 92 140 C94 110 98 90 100 80 L108 80 C110 90 112 110 112 140 C114 200 112 260 108 320 Z" />
      {/* fronds */}
      <path d="M100 80 C70 60 40 55 10 40 C35 50 60 55 85 68 Z" />
      <path d="M100 80 C130 60 160 55 190 40 C165 50 140 55 115 68 Z" />
      <path d="M100 70 C80 45 60 30 40 15 C65 35 80 50 95 72 Z" />
      <path d="M100 70 C120 45 140 30 160 15 C135 35 120 50 105 72 Z" />
      <path d="M100 60 C95 35 90 15 88 0 C95 20 98 40 100 62 Z" />
    </svg>
  );
}
