export type NavItem = {
  label: string;
  href: string;
};

export const navItems: readonly NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Design Your Own", href: "/design" },
  { label: "Upload Artwork", href: "/upload" },
  { label: "Business & Promo", href: "/business" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;
