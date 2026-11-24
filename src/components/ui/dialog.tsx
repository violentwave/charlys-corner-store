import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "bg-bg-0/70 fixed inset-0 z-50 backdrop-blur-sm data-[state=closed]:animate-[fade-out_150ms_ease-in] data-[state=open]:animate-[fade-in_200ms_ease-out] motion-reduce:animate-none",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "border-border bg-bg-2/90 text-text-1 shadow-glow-cyan fixed z-50 grid max-h-[85vh] gap-4 overflow-y-auto border p-6 backdrop-blur-md",
        // mobile: bottom sheet
        "inset-x-0 bottom-0 rounded-t-2xl",
        // desktop: centered with margin auto (no translate, so state animations can't break centering)
        "sm:inset-0 sm:m-auto sm:h-fit sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl",
        // enter/exit: keyframes (Radix waits for animationend before unmounting); off for reduced motion
        "data-[state=closed]:animate-[dialog-out_150ms_ease-in] data-[state=open]:animate-[dialog-in_200ms_ease-out] motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="Close dialog"
        className="text-text-2 hover:bg-bg-3 hover:text-text-1 focus-visible:ring-neon-cyan absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ×
        </span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;
