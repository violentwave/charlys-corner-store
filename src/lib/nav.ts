export type NavItem = {
  label: string;
  href: string;
  /** Shown in the footer (and other secondary navs) but not the primary header nav. */
  footerOnly?: boolean;
};

export const navItems: readonly NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Design Your Own", href: "/design" },
  { label: "Upload Artwork", href: "/upload" },
  { label: "Business & Promo", href: "/business" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Services", href: "/services", footerOnly: true },
  { label: "FAQ", href: "/faq", footerOnly: true },
] as const;
