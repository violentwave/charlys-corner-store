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
      "bg-bg-0/70 fixed inset-0 z-50 backdrop-blur-sm transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
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
        "border-border bg-bg-2/90 text-text-1 shadow-glow-cyan fixed z-50 grid gap-4 border p-6 backdrop-blur-md transition-transform duration-300",
        // mobile: bottom sheet
        "inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl",
        // desktop: centered dialog
        "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-none sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
        "data-[state=closed]:translate-y-4 data-[state=open]:translate-y-0 sm:data-[state=closed]:scale-95 sm:data-[state=open]:scale-100",
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
