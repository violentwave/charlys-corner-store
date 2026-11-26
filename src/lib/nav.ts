export type NavItem = {
  label: string;
  href: string;
  /** Shown in the footer (and other secondary navs) but not the primary header nav. */
  footerOnly?: boolean;
  /**
   * Hybrid one-page Home: when the visitor is already on `/`, the header scrolls to this
   * Home section instead of navigating (the href stays the real page URL for crawlers).
   */
  homeSection?: string;
};

export const navItems: readonly NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Business & Promo", href: "/business", homeSection: "business" },
  { label: "About", href: "/about", homeSection: "about" },
  { label: "Contact", href: "/contact", homeSection: "contact" },
  { label: "Design Your Own", href: "/#design", footerOnly: true },
  { label: "Upload Artwork", href: "/#upload", footerOnly: true },
  { label: "Services", href: "/services", footerOnly: true },
  { label: "FAQ", href: "/faq", footerOnly: true },
] as const;
