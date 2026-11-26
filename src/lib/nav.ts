export type NavGroup = "primary" | "create" | "help" | "explore";

export type NavItem = {
  label: string;
  href: string;
  /** Which list(s) the item appears in ("explore" also feeds it via the other groups). */
  group: NavGroup;
  /**
   * Hybrid one-page Home: when the visitor is already on `/`, the header/menu scrolls to
   * this Home section instead of navigating (the href stays the real page URL for crawlers).
   */
  homeSection?: string;
};

/**
 * Every navigation list lives here. `primaryNav` is the lg+ header row (the logo covers
 * "Home"); `createNav` and `helpNav` feed the footer columns and the site menu; `exploreNav`
 * is the menu's "Explore" list. An item may carry several groups (see the spreads below).
 */
export const navItems: readonly NavItem[] = [
  // Primary header nav (lg+).
  { label: "Shop", href: "/shop", group: "primary" },
  { label: "Business & Promo", href: "/business", group: "primary", homeSection: "business" },
  { label: "About", href: "/about", group: "primary", homeSection: "about" },
  { label: "Contact", href: "/contact", group: "primary", homeSection: "contact" },

  // Menu + footer "Create" column.
  { label: "Design Your Own", href: "/#design", group: "create" },
  { label: "Upload Artwork", href: "/#upload", group: "create" },
  { label: "Shop", href: "/shop", group: "create" },
  { label: "Business & Promo", href: "/business", group: "create" },

  // Menu + footer "Help" column.
  { label: "Services", href: "/services", group: "help" },
  { label: "FAQ", href: "/faq", group: "help" },
  { label: "Contact", href: "/contact", group: "help" },

  // Menu "Explore" list (everything a visitor can reach from the drawer).
  { label: "Home", href: "/", group: "explore" },
  { label: "Shop", href: "/shop", group: "explore" },
  { label: "Services", href: "/services", group: "explore" },
  { label: "Business & Promo", href: "/business", group: "explore", homeSection: "business" },
  { label: "About", href: "/about", group: "explore", homeSection: "about" },
  { label: "FAQ", href: "/faq", group: "explore" },
  { label: "Contact", href: "/contact", group: "explore", homeSection: "contact" },
] as const;

const inGroup = (group: NavGroup) => navItems.filter((item) => item.group === group);

export const primaryNav = inGroup("primary");
export const createNav = inGroup("create");
export const helpNav = inGroup("help");
export const exploreNav = inGroup("explore");

/** Account-page sections for the member menu; they all live under /account#<hash>. */
export const accountNav = [
  { label: "My designs", hash: "designs" },
  { label: "Drafts", hash: "drafts" },
  { label: "Brand kit", hash: "brand" },
  { label: "Sizes & rosters", hash: "sizes" },
  { label: "Settings", hash: "settings" },
  { label: "Security", hash: "security" },
] as const;
