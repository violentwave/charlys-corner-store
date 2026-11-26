import Link from "next/link";

import { BackToTop } from "@/components/layout/back-to-top";
import { CurrentYear } from "@/components/layout/current-year";
import { TrackOrderLink } from "@/components/layout/track-order-link";

import { createNav, helpNav } from "@/lib/nav";
import { site } from "@/lib/site";

const COLUMN_HEADING = "font-heading text-text-3 text-xs tracking-widest uppercase";
const COLUMN_LINK = "text-text-2 hover:text-neon-cyan text-sm transition-colors";

export function SiteFooter() {
  const socialEntries = Object.entries(site.socials) as [string, string][];

  return (
    <footer className="border-border bg-bg-1 mt-12 border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <p className="font-heading text-text-1 text-sm tracking-widest uppercase">{site.name}</p>
          <p className="text-text-2 text-sm">
            Custom tees, hats, hoodies &amp; promo products in {site.city}, {site.region}.
          </p>
          <p className="text-neon-yellow font-mono text-sm">{site.tagline} 🐾</p>
          {socialEntries.length > 0 ? (
            <ul className="mt-1 flex gap-3">
              {socialEntries.map(([network, url]) => (
                <li key={network}>
                  <a href={url} className={COLUMN_LINK} rel="noopener noreferrer" target="_blank">
                    {network}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <nav aria-label="Create" className="flex flex-col gap-2">
          <p className={COLUMN_HEADING}>Create</p>
          <ul className="flex flex-col gap-1">
            {createNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={COLUMN_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Help" className="flex flex-col gap-2">
          <p className={COLUMN_HEADING}>Help</p>
          <ul className="flex flex-col gap-1">
            {helpNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={COLUMN_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <TrackOrderLink />
            </li>
          </ul>
        </nav>

        <div className="flex flex-col gap-2">
          <p className={COLUMN_HEADING}>Contact</p>
          <a href={`mailto:${site.email}`} className="text-neon-cyan text-sm underline-offset-4 hover:underline">
            {site.email.toLowerCase()}
          </a>
          {site.phone ? (
            <a href={`tel:${site.phone}`} className={COLUMN_LINK}>
              {site.phone}
            </a>
          ) : null}
          {site.address ? <p className="text-text-2 text-sm">{site.address}</p> : null}
          {site.hours ? <p className="text-text-2 text-sm">{site.hours}</p> : null}
        </div>
      </div>

      <div className="border-border border-t">
        <div className="text-text-3 mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs sm:flex-row sm:px-6">
          <p>
            © <CurrentYear /> {site.legalName}. All rights reserved.
          </p>
          <BackToTop />
        </div>
      </div>
    </footer>
  );
}
