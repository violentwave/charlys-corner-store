"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";

import { postJson, NETWORK_ERROR } from "@/components/forms/auth-post";
import { GoogleButton } from "@/components/forms/google-button";
import { AUTH_CHANGED_EVENT, useSession } from "@/components/layout/session";
import { scrollToSection } from "@/components/layout/section-scroll";
import { accountNav, exploreNav, menuCreateNav, type NavItem } from "@/lib/nav";
import { site } from "@/lib/site";

const HEADING = "font-heading text-text-3 text-xs tracking-widest uppercase";
/** Every interactive row is ≥ 44px tall (WCAG 2.5.8 / 2.2 touch target). */
const ROW =
  "text-text-2 hover:text-text-1 focus-visible:ring-neon-cyan data-[active=true]:bg-bg-2 data-[active=true]:text-neon-cyan flex min-h-[44px] items-center rounded-md px-3 text-base font-medium transition-colors hover:bg-bg-2";

/** Modifier/middle-button clicks (new tab / new window) must keep the browser's default. */
function isPlainLeftClick(event: MouseEvent<HTMLElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Contents of the site-menu drawer (slides in from the right at every screen size). Two
 * shapes: the visitor gets the "Join the pack" card plus Create/Explore lists; the member
 * gets a header block with the account sections and a Log out row.
 */
export function SiteMenu({ close, isActive }: { close: () => void; isActive: (item: NavItem) => boolean }) {
  const pathname = usePathname();
  const { loading, user, googleEnabled } = useSession();

  const onMenuNavClick = (event: MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    close();
    if (!isPlainLeftClick(event)) return;
    // On Home, tabs with a Home section scroll to it instead of navigating (hybrid one-page
    // Home); the href stays the real page URL for crawlers and other pages.
    if (pathname === "/" && item.homeSection) {
      const el = document.getElementById(item.homeSection);
      if (!el) return; // section missing — navigate normally
      event.preventDefault();
      history.replaceState(null, "", `#${item.homeSection}`);
      scrollToSection(item.homeSection); // waits for the body-scroll lock to release
      return;
    }
    // "Home" while already on Home: scroll back up and clear the hash (scroll-spy marks it).
    if (pathname === "/" && item.href === "/") {
      event.preventDefault();
      history.replaceState(null, "", window.location.pathname + window.location.search);
      scrollToSection("design");
    }
  };

  /** On /account already: switch the tab via the hash (the page listens on hashchange). */
  const onAccountNavClick = (event: MouseEvent<HTMLAnchorElement>, hash: string) => {
    close();
    if (!isPlainLeftClick(event)) return;
    if (pathname === "/account") {
      event.preventDefault();
      // pushState instead of `location.hash = …` (the React-compiler lint forbids writing
      // to window); a synthetic hashchange tells the account tabs to switch.
      history.pushState(null, "", `#${hash}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  };

  const menuLink = (item: NavItem) => {
    const active = isActive(item);
    return (
      <Link
        key={`${item.group}-${item.href}`}
        href={item.href}
        aria-current={active ? (pathname === "/" && item.homeSection ? "location" : "page") : undefined}
        data-active={active || undefined}
        onClick={(event) => onMenuNavClick(event, item)}
        className={ROW}
      >
        {item.label}
      </Link>
    );
  };

  const contactStrip = (
    <div className="border-border flex flex-col gap-1.5 border-t px-3 py-4">
      <a href={`mailto:${site.email}`} className="text-neon-cyan text-sm underline-offset-4 hover:underline">
        {site.email.toLowerCase()}
      </a>
      {site.phone ? (
        <a href={`tel:${site.phone}`} className="text-text-2 text-sm">
          {site.phone}
        </a>
      ) : null}
      {site.address ? <p className="text-text-2 text-sm">{site.address}</p> : null}
      {site.hours ? <p className="text-text-2 text-sm">{site.hours}</p> : null}
    </div>
  );

  return (
    <>
      {/* Session skeleton while /api/auth/me loads — never the wrong shape (no "Log in" flash). */}
      {loading ? (
        <span
          aria-hidden="true"
          data-testid="menu-session-loading"
          className="bg-bg-3 m-3 h-16 animate-pulse rounded-lg motion-reduce:animate-none"
        />
      ) : user ? (
        <MemberHeader user={user} />
      ) : (
        <JoinCard pathname={pathname} googleEnabled={googleEnabled} close={close} />
      )}

      {user ? (
        <div className="flex flex-col gap-0.5 px-3">
          <p className={`${HEADING} px-3 py-2`}>Your account</p>
          {accountNav.map(({ label, hash }) => (
            <Link
              key={hash}
              href={`/account#${hash}`}
              data-testid={hash === "designs" ? "account-link" : undefined}
              aria-current={hash === "designs" && pathname === "/account" ? "page" : undefined}
              onClick={(event) => onAccountNavClick(event, hash)}
              className={ROW}
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5 px-3">
        <p className={`${HEADING} px-3 py-2`}>Create</p>
        {menuCreateNav.map(menuLink)}
      </div>

      <div className="flex flex-col gap-0.5 px-3">
        <p className={`${HEADING} px-3 py-2`}>Explore</p>
        {exploreNav.map(menuLink)}
      </div>

      {contactStrip}

      {user ? <LogoutRow close={close} /> : null}
    </>
  );
}

/** Visitor card: the join pitch plus the three sign-in entry points (Google wins errors + 2FA). */
function JoinCard({ pathname, googleEnabled, close }: { pathname: string; googleEnabled: boolean; close: () => void }) {
  return (
    <div className="border-border bg-bg-2 mx-3 rounded-2xl border p-4">
      <p className="font-heading text-text-1 text-sm tracking-wide uppercase">Join the pack</p>
      <p className="text-text-2 mt-1 text-sm">
        Save designs, track orders, and get 15% off your next order after your first.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <GoogleButton next={pathname} googleEnabled={googleEnabled} />
        <Link
          href={`/signup?next=${encodeURIComponent(pathname)}`}
          onClick={close}
          className="bg-neon-pink text-bg-0 shadow-glow-pink focus-visible:ring-neon-cyan inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:outline-none"
        >
          Create account
        </Link>
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          onClick={close}
          data-testid="account-link"
          className="border-neon-cyan text-neon-cyan hover:shadow-glow-cyan focus-visible:ring-neon-cyan inline-flex min-h-[44px] items-center justify-center rounded-full border px-5 text-sm font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}

/** Member header: greeting, email, and (until verified) the verify-your-email nudge. */
function MemberHeader({ user }: { user: { email: string; name: string | null; verified: boolean } }) {
  const [resend, setResend] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onResend = async () => {
    setResend("pending");
    setError(null);
    const { data } = await postJson("/api/auth/resend");
    if (data?.ok) setResend("sent");
    else {
      setResend("error");
      setError(data && !data.ok ? data.error : NETWORK_ERROR);
    }
  };

  return (
    <div className="px-3 py-4">
      <p className="font-heading text-text-1 text-base tracking-wide uppercase">Hey, {user.name ?? user.email}</p>
      {user.name ? <p className="text-text-3 mt-0.5 truncate text-xs">{user.email}</p> : null}
      {!user.verified ? (
        <div className="border-neon-yellow/60 bg-neon-yellow/10 mt-3 rounded-lg border p-3">
          <p className="text-text-1 text-sm">Verify your email to unlock your mockup + coupon</p>
          <button
            type="button"
            onClick={onResend}
            disabled={resend === "pending"}
            className="border-neon-yellow text-neon-yellow focus-visible:ring-neon-cyan mt-2 inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            {resend === "pending" ? "Sending…" : "Resend email"}
          </button>
          {/* aria-live region so "Sent" / errors announce without moving focus. */}
          <p aria-live="polite" className="text-sm">
            {resend === "sent" ? <span className="text-neon-green">Sent</span> : null}
            {resend === "error" && error ? <span className="text-danger">{error}</span> : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Member menu footer: signs out, announces the change, and heads home. */
function LogoutRow({ close }: { close: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogout = async () => {
    setPending(true);
    setError(null);
    const { data } = await postJson("/api/auth/logout");
    if (data?.ok) {
      close();
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT)); // the menu flips to the Join card
      router.push("/");
      return;
    }
    setPending(false);
    setError(data && !data.ok ? data.error : NETWORK_ERROR);
  };

  return (
    <div className="border-border mt-auto flex flex-col gap-1.5 border-t px-6 py-4">
      <button
        type="button"
        onClick={onLogout}
        disabled={pending}
        data-testid="menu-logout"
        className="text-text-2 hover:text-danger hover:bg-bg-2 focus-visible:ring-neon-cyan inline-flex min-h-[44px] items-center rounded-md px-3 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        Log out
      </button>
      {error ? (
        <p role="alert" className="text-danger px-3 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
