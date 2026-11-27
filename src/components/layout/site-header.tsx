"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { addTransitionType, startTransition, useEffect, useRef, useState, type MouseEvent } from "react";

import { CartLink } from "@/components/layout/cart-link";
import { jumpToSection } from "@/components/layout/section-scroll";
import { useSession } from "@/components/layout/session";
import { SiteMenu } from "@/components/layout/site-menu";
import { CART_CHANGED_EVENT } from "@/lib/cart-events";
import { primaryNav, type NavItem } from "@/lib/nav";
import { site } from "@/lib/site";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Home sections that mean "no specific tab" (the Home tab stays highlighted). */
const HOME_SECTIONS = new Set(["design", "upload", "services", "how-it-works"]);

export function SiteHeader() {
  const pathname = usePathname();
  const { loading, user } = useSession();
  const [open, setOpen] = useState(false);
  // Scroll-spy (Home only): the id of the section currently in view, null for the top.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // Cart badge (members only): re-read once per page load and on every cart change.
  const [cartCount, setCartCount] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isHome = pathname === "/";
  // On other pages no section is highlighted (the path-based rule applies instead).
  const effectiveSection = isHome ? activeSection : null;

  // Tag browser back/forward navigations so the directional slide plays the right way.
  useEffect(() => {
    const onPop = () => {
      startTransition(() => {
        try {
          addTransitionType("nav-back");
        } catch {
          /* unsupported browsers: no-op */
        }
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const signedIn = user !== null;
  // Keyed by the member: signing out and in as someone else re-reads their cart.
  const memberEmail = user?.email ?? null;
  useEffect(() => {
    if (!memberEmail) return;
    let alive = true;
    const read = () =>
      fetch("/api/cart", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return null;
          const data = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
          return Array.isArray(data?.items) ? data.items.length : null;
        })
        .then((count) => {
          if (alive && count !== null) setCartCount(count);
        })
        .catch(() => undefined);
    void read();
    window.addEventListener(CART_CHANGED_EVENT, read);
    return () => {
      alive = false;
      window.removeEventListener(CART_CHANGED_EVENT, read);
    };
  }, [memberEmail]);

  const isActive = (item: NavItem) => {
    if (isHome && item.homeSection) return effectiveSection === item.homeSection;
    if (item.href === "/") return isHome ? effectiveSection === null : pathname === "/";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  // Scroll-spy: a thin band around the viewport's middle decides the active tab.
  // `past-work` is not a tab, so it leaves the previous highlight in place.
  useEffect(() => {
    if (!isHome || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(HOME_SECTIONS.has(visible.target.id) ? null : visible.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const id of ["design", "upload", "services", "how-it-works", "business", "about", "contact"]) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [isHome]);

  // Body scroll lock + focus management
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const drawer = drawerRef.current;
    const button = buttonRef.current;
    const focusables = drawer ? Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
    (focusables[0] ?? drawer)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const nodes = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      button?.focus();
    };
  }, [open]);

  /**
   * Progressive enhancement (hybrid one-page Home): on `/`, tabs with a Home section
   * scroll to it instead of navigating; the href stays the real page URL for crawlers
   * and for normal navigation from any other page.
   */
  const onNavClick = (event: MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!isHome) return;

    // Home while already on Home: back to the top (the builder), no reload.
    if (item.href === "/" && !item.homeSection) {
      event.preventDefault();
      history.replaceState(null, "", "/");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      return;
    }

    if (item.homeSection) {
      const el = document.getElementById(item.homeSection);
      if (!el) return; // section missing — navigate normally
      event.preventDefault();
      history.replaceState(null, "", `#${item.homeSection}`);
      jumpToSection(item.homeSection);
    }
  };

  const renderNavLink = (item: NavItem) => {
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        transitionTypes={["nav-forward"]}
        aria-current={active ? (isHome && item.homeSection ? "location" : "page") : undefined}
        onClick={(event) => onNavClick(event, item)}
        className={`relative px-3 py-2 text-sm font-medium transition-colors duration-150 ${
          active ? "text-neon-cyan" : "text-text-2 hover:text-text-1"
        }`}
      >
        {item.label}
        {active ? (
          <span aria-hidden="true" className="bg-neon-cyan shadow-glow-cyan absolute inset-x-2 -bottom-0.5 h-0.5" />
        ) : null}
      </Link>
    );
  };

  /** Members get a cyan status dot on the menu button; the label carries it too (not color alone). */
  const menuButtonLabel = open
    ? "Close menu"
    : user
      ? `Open menu, signed in as ${user.name ?? user.email}`
      : "Open menu";

  return (
    <>
      <header className="bg-bg-0/80 sticky top-0 z-50 backdrop-blur-md" style={{ viewTransitionName: "site-header" }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={`${site.name} home`}>
            <Image
              src="/brand/logo.png"
              alt={`${site.name} logo`}
              width={72}
              height={48}
              priority
              className="h-12 w-auto"
            />
          </Link>

          <nav aria-label="Primary" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {primaryNav.map(renderNavLink)}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {signedIn && !loading ? <CartLink count={cartCount} /> : null}
            {/* One "Design Your Own" CTA: full pill from lg, compact pill below (the other is display:none). */}
            <Link
              href="/#design"
              transitionTypes={["nav-forward"]}
              className="bg-neon-pink text-bg-0 shadow-glow-pink focus-visible:ring-neon-cyan hidden rounded-full px-5 py-2 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:outline-none lg:inline-flex"
            >
              Design Your Own
            </Link>
            <Link
              href="/#design"
              transitionTypes={["nav-forward"]}
              aria-label="Design Your Own"
              data-testid="design-cta-compact"
              className="bg-neon-pink text-bg-0 shadow-glow-pink focus-visible:ring-neon-cyan inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:outline-none lg:hidden"
            >
              Design
            </Link>

            <button
              ref={buttonRef}
              type="button"
              data-testid="menu-button"
              className="text-text-1 hover:bg-bg-2 focus-visible:ring-neon-cyan relative inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={menuButtonLabel}
              onClick={() => setOpen((value) => !value)}
            >
              {user && !loading ? (
                <span
                  aria-hidden="true"
                  data-testid="menu-member-dot"
                  className="bg-neon-cyan shadow-glow-cyan absolute top-1.5 right-1.5 h-2 w-2 rounded-full"
                />
              ) : null}
              <span aria-hidden="true" className="flex flex-col gap-1.5">
                <span
                  className={`block h-0.5 w-6 bg-current transition-transform duration-150 ${
                    open ? "translate-y-2 rotate-45" : ""
                  }`}
                />
                <span
                  className={`block h-0.5 w-6 bg-current transition-opacity duration-150 ${
                    open ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`block h-0.5 w-6 bg-current transition-transform duration-150 ${
                    open ? "-translate-y-2 -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        <div aria-hidden="true" className="bg-vice h-px w-full" />
      </header>

      {/* Site menu: slides in from the right at every screen size. It lives outside <header> on
          purpose: the header's backdrop-blur makes it the containing block for fixed children,
          which squeezed the menu into the 64px header bar. */}
      <div
        className={`fixed inset-0 z-[60] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!open}
        inert={!open}
      >
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label="Close menu"
          className={`bg-bg-0/70 absolute inset-0 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          id="site-menu"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          tabIndex={-1}
          data-open={open || undefined}
          style={{ viewTransitionName: "site-menu" }}
          className={`bg-bg-1 shadow-glow-cyan absolute inset-y-0 right-0 flex w-[88vw] max-w-sm flex-col overflow-y-auto transition-transform duration-200 motion-reduce:transition-none ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <span className="font-heading text-text-1 text-sm tracking-widest uppercase">Menu</span>
            <button
              type="button"
              className="text-text-2 hover:bg-bg-2 hover:text-text-1 focus-visible:ring-neon-cyan inline-flex h-10 w-10 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>
          <SiteMenu close={() => setOpen(false)} isActive={isActive} cartCount={cartCount} />
        </div>
      </div>
    </>
  );
}
