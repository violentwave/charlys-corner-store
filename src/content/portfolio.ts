/**
 * Past-work photos (source: Assets/Clothes, optimized to public/portfolio/*.webp).
 * PLACEHOLDERS: Logan will supply better photos. Several are tiny (<300px): never upscale;
 * render them at their intrinsic size or smaller.
 *
 * ⚠️ Client logos are visible. Brief Q11 (owner OK to show client work?) must be ✅ before launch.
 * Until then `clientWork: true` items may be shown in previews only.
 */
export type PortfolioItem = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  kind: "apparel" | "headwear" | "print" | "promo";
  clientWork: boolean;
};

export const portfolio: readonly PortfolioItem[] = [
  {
    src: "/portfolio/bulldog-pillows.webp",
    width: 1100,
    height: 619,
    alt: "Two custom printed pillows showing cartoon bulldogs in sunglasses",
    caption: "Custom printed pillows",
    kind: "promo",
    clientWork: false,
  },
  {
    src: "/portfolio/jd-electric-lanyard.webp",
    width: 1100,
    height: 733,
    alt: "Navy lanyard printed with a repeating JD Electric logo",
    caption: "Printed lanyards",
    kind: "promo",
    clientWork: true,
  },
  {
    src: "/portfolio/a1-pressure-cleaning-print.webp",
    width: 800,
    height: 1067,
    alt: "Full-color A1 Pressure Cleaning logo print on a dark garment",
    caption: "Full-color business logo",
    kind: "apparel",
    clientWork: true,
  },
  {
    src: "/portfolio/tcs-business-cards.webp",
    width: 600,
    height: 800,
    alt: "Stack of TCS Cleaning business cards with an appointment-card back",
    caption: "Business & appointment cards",
    kind: "print",
    clientWork: true,
  },
  {
    src: "/portfolio/logo-tees-order.webp",
    width: 283,
    height: 378,
    alt: "Box of finished navy and gray logo tees ready for pickup",
    caption: "Bulk logo tees",
    kind: "apparel",
    clientWork: true,
  },
  {
    src: "/portfolio/sharkboy-tee-and-hat.webp",
    width: 223,
    height: 297,
    alt: "White tee with a Sharkboy character print and a matching trucker hat",
    caption: "Character tee + hat set",
    kind: "apparel",
    clientWork: true,
  },
  {
    src: "/portfolio/gold-star-water-tee.webp",
    width: 207,
    height: 276,
    alt: "White tee printed with the Gold Star Water logo and slogan",
    caption: "Business tees",
    kind: "apparel",
    clientWork: true,
  },
  {
    src: "/portfolio/harley-family-trucker-hat.webp",
    width: 183,
    height: 244,
    alt: "White and black trucker hat with the Harley & Family washing specialists logo",
    caption: "Trucker hats",
    kind: "headwear",
    clientWork: true,
  },
  {
    src: "/portfolio/hustle-hat-and-sticker.webp",
    width: 128,
    height: 171,
    alt: "Red trucker hat with a graffiti-style Hustle design and a matching sticker",
    caption: "Hat + matching sticker",
    kind: "headwear",
    clientWork: true,
  },
  {
    src: "/portfolio/crystal-can-cleaners-hat.webp",
    width: 110,
    height: 151,
    alt: "Trucker hat with a round Crystal Can Cleaners logo",
    caption: "Logo trucker hat",
    kind: "headwear",
    clientWork: true,
  },
  {
    src: "/portfolio/green-and-clean-print.webp",
    width: 124,
    height: 166,
    alt: "Dark print with the Green & Clean Property Services logo and phone numbers",
    caption: "Business branding",
    kind: "print",
    clientWork: true,
  },
] as const;
