"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { AccountLink } from "@/components/layout/account-link";
import { navItems, type NavItem } from "@/lib/nav";
import { site } from "@/lib/site";

const primaryNavItems = navItems.filter((item) => !item.footerOnly);

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Home sections that mean "no specific tab" (the Home tab stays highlighted). */
const HOME_SECTIONS = new Set(["design", "upload", "services", "how-it-works"]);

/**
 * Scroll to a Home section and move focus to its heading. Called after the mobile drawer
 * closes, so it waits for the body-scroll lock to release (the unlock runs in a cleanup
 * effect) before scrolling. `scrollIntoView()` follows the CSS `scroll-behavior`, so it is
 * smooth normally and instant with reduced motion.
 */
function scrollToSection(id: string) {
  let tries = 0;
  const go = () => {
    if (document.body.style.overflow === "hidden" && tries++ < 10) {
      requestAnimationFrame(go);
      return;
    }
    document.getElementById(id)?.scrollIntoView();
    document.querySelector<HTMLElement>(`#${id} [data-section-heading]`)?.focus({ preventScroll: true });
  };
  requestAnimationFrame(go);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Scroll-spy (Home only): the id of the section currently in view, null for the top.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isHome = pathname === "/";
  // On other pages no section is highlighted (the path-based rule applies instead).
  const effectiveSection = isHome ? activeSection : null;

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
   * scroll to it instead of navigating; "Home" scrolls to the top. The href stays the
   * real page URL for crawlers and for normal navigation from any other page.
   */
  const onNavClick = (event: MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    const wasOpen = open;
    setOpen(false);
    // Let the browser handle new-tab / new-window clicks (Ctrl/Cmd/Shift/Alt, middle button).
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!isHome) return;

    if (item.homeSection) {
      const el = document.getElementById(item.homeSection);
      if (!el) return; // section missing — navigate normally
      event.preventDefault();
      history.replaceState(null, "", `#${item.homeSection}`);
      if (wasOpen) scrollToSection(item.homeSection);
      else {
        el.scrollIntoView();
        document
          .querySelector<HTMLElement>(`#${item.homeSection} [data-section-heading]`)
          ?.focus({ preventScroll: true });
      }
      return;
    }

    if (item.href === "/") {
      event.preventDefault();
      history.replaceState(null, "", window.location.pathname + window.location.search);
      if (wasOpen) scrollToSection("design");
      else {
        window.scrollTo({ top: 0 });
        document.querySelector<HTMLElement>("#design [data-section-heading]")?.focus({ preventScroll: true });
      }
    }
  };

  const renderNavLink = (item: NavItem, inDrawer: boolean) => {
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? (isHome ? "location" : "page") : undefined}
        onClick={(event) => onNavClick(event, item)}
        className={
          inDrawer
            ? `rounded-md px-3 py-3 text-base font-medium transition-colors ${
                active ? "bg-bg-2 text-neon-cyan" : "text-text-2 hover:bg-bg-2 hover:text-text-1"
              }`
            : `relative px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                active ? "text-neon-cyan" : "text-text-2 hover:text-text-1"
              }`
        }
      >
        {item.label}
        {!inDrawer && active ? (
          <span aria-hidden="true" className="bg-neon-cyan shadow-glow-cyan absolute inset-x-2 -bottom-0.5 h-0.5" />
        ) : null}
      </Link>
    );
  };

  return (
    <header className="bg-bg-0/80 sticky top-0 z-50 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
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
          {primaryNavItems.map((item) => renderNavLink(item, false))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <AccountLink variant="nav" />
          <Link
            href="/#design"
            className="bg-neon-pink text-bg-0 shadow-glow-pink hidden rounded-full px-5 py-2 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 lg:inline-flex"
          >
            Design Your Own
          </Link>

          <button
            ref={buttonRef}
            type="button"
            className="text-text-1 hover:bg-bg-2 inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav-drawer"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
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

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-[60] lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!open}
        inert={!open}
      >
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label="Close menu"
          className={`bg-bg-0/70 absolute inset-0 backdrop-blur-sm transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          id="mobile-nav-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          tabIndex={-1}
          className={`bg-bg-1 shadow-glow-cyan absolute inset-y-0 left-0 flex w-[85vw] max-w-xs flex-col transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="border-border flex items-center justify-between border-b px-5 py-4">
            <span className="font-heading text-text-1 text-sm tracking-widest uppercase">Menu</span>
            <button
              type="button"
              className="text-text-2 hover:bg-bg-2 hover:text-text-1 inline-flex h-10 w-10 items-center justify-center rounded-md"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>
          <nav aria-label="Mobile primary" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
            {primaryNavItems.map((item) => renderNavLink(item, true))}
            <AccountLink variant="drawer" onNavigate={() => setOpen(false)} />
            <Link
              href="/#design"
              onClick={() => setOpen(false)}
              className="bg-neon-pink text-bg-0 shadow-glow-pink mt-4 rounded-full px-5 py-3 text-center text-sm font-semibold"
            >
              Design Your Own
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
