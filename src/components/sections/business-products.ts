import { catalog, type Product } from "@/content/catalog";

/**
 * The one merged product list for Business & Promo: the old Home "featured" strip and the
 * /business "Products" grid combined, no duplicates (P48-1). The full list renders on
 * /business; Home's summary shows the first six plus a link to the full page.
 */
const businessSlugs = [
  "gildan-cotton-tees",
  "custom-hats",
  "business-cards",
  "custom-foam-koozies",
  "austin-hodge-memorial-shirt",
  "banners",
  "polos",
  "flyers",
  "stickers",
  "lanyards",
  "pillows",
] as const;

export const businessProducts: readonly Product[] = businessSlugs
  .map((slug) => catalog.find((product) => product.slug === slug))
  .filter((product): product is Product => Boolean(product));

/** How many products the Home summary shows before linking to the full /business page. */
export const HOME_SUMMARY_PRODUCT_COUNT = 6;
