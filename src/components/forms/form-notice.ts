import { site } from "@/lib/site";
import { toast } from "@/components/ui/toast";

/**
 * Phase 2 placeholder for public form submission. Phase 3 replaces this with real
 * server-side submission + owner notification. Until then, every public form
 * notifies the visitor that online forms are almost ready and points them at email.
 */
export function notifyFormsComingSoon(): void {
  toast({
    title: "Online forms are almost ready",
    description: `For now, email us at ${site.email}.`,
    variant: "default",
  });
}
