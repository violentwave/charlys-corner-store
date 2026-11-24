"use client";

import { useEffect, useRef } from "react";

import Link from "next/link";

import { navItems } from "@/lib/nav";
import { site } from "@/lib/site";

export function SiteFooter() {
  const yearRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (yearRef.current) {
      yearRef.current.textContent = String(new Date().getFullYear());
    }
  }, []);
  const socialEntries = Object.entries(site.socials) as [string, string][];

  return (
    <footer className="border-border mt-12 border-t bg-bg-1">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div className="flex flex-col gap-3">
          <p className="font-heading text-sm tracking-widest text-text-1 uppercase">
            {site.name}
          </p>
          <p className="text-text-2 text-sm">
            Custom tees, hats, hoodies &amp; promo products in {site.city}, {site.region}.
          </p>
          <p className="text-neon-yellow font-mono text-sm">{site.tagline} 🐾</p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-2">
          <p className="font-heading text-xs tracking-widest text-text-3 uppercase">
            Navigate
          </p>
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-text-2 text-sm transition-colors hover:text-neon-cyan"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-2">
          <p className="font-heading text-xs tracking-widest text-text-3 uppercase">
            Contact
          </p>
          <a
            href={`mailto:${site.email}`}
            className="text-neon-cyan text-sm underline-offset-4 hover:underline"
          >
            {site.email.toLowerCase()}
          </a>
          {site.phone ? (
            <a href={`tel:${site.phone}`} className="text-text-2 text-sm hover:text-neon-cyan">
              {site.phone}
            </a>
          ) : null}
          {site.address ? <p className="text-text-2 text-sm">{site.address}</p> : null}
          {site.hours ? <p className="text-text-2 text-sm">{site.hours}</p> : null}
          {socialEntries.length > 0 ? (
            <ul className="mt-2 flex gap-3">
              {socialEntries.map(([network, url]) => (
                <li key={network}>
                  <a
                    href={url}
                    className="text-text-2 text-sm hover:text-neon-cyan"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {network}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="border-border border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-text-3 sm:flex-row sm:px-6">
          <p>
            © <span ref={yearRef} suppressHydrationWarning /> {site.legalName}. All rights reserved.
          </p>
          <p>Have a Ruffin awesome day 🐾</p>
        </div>
      </div>
    </footer>
  );
}
