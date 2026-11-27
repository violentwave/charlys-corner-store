import type { ReactNode } from "react";
import { ViewTransition } from "react";

/**
 * Route content wrapper (P52-3, docs/03 Motion). Every page wraps its content in this so a
 * navigation crossfades with a short upward slide, and a back navigation plays the reverse
 * (the header adds `nav-back` on popstate).
 *
 * It lives in each `page.tsx`, not the layout: layouts persist across navigations, so their
 * enter/exit animations never fire. The header, footer and menu drawer sit outside it and
 * carry their own `view-transition-name`, so only the page content moves.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "page-in", "nav-back": "page-in-back", default: "page-in" }}
      exit={{ "nav-forward": "page-out", "nav-back": "page-out-back", default: "page-out" }}
    >
      {children}
    </ViewTransition>
  );
}
