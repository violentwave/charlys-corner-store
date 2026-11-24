/**
 * Product catalog carried over from the old Weebly store (product.html, audited 2026-11-23),
 * plus products the owner confirmed he offers but the old site never listed.
 *
 * Prices are the old site's displayed prices/ranges, in cents. Do not invent prices:
 * anything unknown is `null` and renders as "Get a quote". Real checkout arrives in Phase 5.
 */

export type ProductCategory = "apparel" | "headwear" | "memorial" | "print" | "promo" | "signage";

export type Product = {
  slug: string;
  name: string;
  category: ProductCategory;
  /** Lowest displayed price in cents, or null when unknown (TODO(content): owner pricing, Brief Q3). */
  priceFromCents: number | null;
  /** Highest displayed price in cents when the old site showed a range. */
  priceToCents?: number;
  /** Short factual blurb. Only facts from the old site or owner answers. */
  blurb: string;
  /** Listed on the old site (parity) vs newly confirmed by the owner. */
  source: "legacy-site" | "owner-confirmed";
  /** Fundraiser note shown with memorial shirts. */
  donation?: string;
};

export const catalog: readonly Product[] = [
  {
    slug: "austin-hodge-memorial-shirt",
    name: "Austin Hodge Memorial Shirt",
    category: "memorial",
    priceFromCents: 3000,
    blurb: "Memorial tee.",
    donation: "A percentage of all sales goes to the Hodge family.",
    source: "legacy-site",
  },
  {
    // TODO(content): old site shows "Omari Lewis" as the product name but "Omari Linzell Williams" in its link text — confirm with owner before launch.
    slug: "omari-lewis-memorial-shirt",
    name: "Omari Lewis Memorial Shirt",
    category: "memorial",
    priceFromCents: 3000,
    priceToCents: 3500,
    blurb: "Memorial tee.",
    source: "legacy-site",
  },
  {
    slug: "custom-hats",
    name: "Custom Hats",
    category: "headwear",
    priceFromCents: 4800,
    blurb: "Your logo or design on a hat.",
    source: "legacy-site",
  },
  {
    slug: "polos",
    name: "Men and Women's Polos",
    category: "apparel",
    priceFromCents: 5500,
    priceToCents: 6350,
    blurb: "Custom polos for teams, staff, and uniforms.",
    source: "legacy-site",
  },
  {
    slug: "gildan-custom-tank-tops",
    name: "Gildan Custom Tank Tops",
    category: "apparel",
    priceFromCents: 1699,
    priceToCents: 2099,
    blurb: "Custom-printed Gildan tanks.",
    source: "legacy-site",
  },
  {
    slug: "gildan-cotton-tees",
    name: "Gildan Cotton Tees",
    category: "apparel",
    priceFromCents: 2500,
    priceToCents: 3000,
    blurb: "Custom-printed Gildan cotton tees.",
    source: "legacy-site",
  },
  {
    slug: "banners",
    name: "Banners for Indoor or Outdoor Use",
    category: "signage",
    priceFromCents: 12500,
    priceToCents: 22500,
    blurb: "Available in 6×3, 8×3, and 10×3 ft.",
    source: "legacy-site",
  },
  {
    slug: "custom-foam-koozies",
    name: "Custom Foam Koozies",
    category: "promo",
    priceFromCents: 125,
    blurb: "Branded foam koozies.",
    source: "legacy-site",
  },
  {
    slug: "business-cards",
    name: "Business Cards",
    category: "print",
    priceFromCents: 5750,
    priceToCents: 15000,
    blurb: "250, 500, or 1,000 cards in matte or glossy. Appointment-card backs available.",
    source: "legacy-site",
  },
  // Owner-confirmed 2026-11-23, never listed on the old site. Pricing unknown (Brief Q3).
  {
    slug: "flyers",
    name: "Flyers",
    category: "print",
    priceFromCents: null,
    blurb: "Printed flyers for your business or event.",
    source: "owner-confirmed",
  },
  {
    slug: "stickers",
    name: "Stickers & Decals",
    category: "print",
    priceFromCents: null,
    blurb: "Custom stickers and decals.",
    source: "owner-confirmed",
  },
  {
    slug: "lanyards",
    name: "Lanyards",
    category: "promo",
    priceFromCents: null,
    blurb: "Custom printed lanyards.",
    source: "owner-confirmed",
  },
  {
    slug: "pillows",
    name: "Custom Printed Pillows",
    category: "promo",
    priceFromCents: null,
    blurb: "Your photo or art on a pillow.",
    source: "owner-confirmed",
  },
] as const;

/** Business & Promo page list from the old site, verbatim items. */
export const legacyPromoItems = ["Hats", "Koozies", "Totes", "Mouse pads", "Pop sockets"] as const;

export function formatPrice(product: Pick<Product, "priceFromCents" | "priceToCents">): string {
  const fmt = (cents: number) =>
    (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    });
  if (product.priceFromCents === null) return "Get a quote";
  if (product.priceToCents && product.priceToCents !== product.priceFromCents) {
    return `${fmt(product.priceFromCents)}–${fmt(product.priceToCents)}`;
  }
  return fmt(product.priceFromCents);
}
