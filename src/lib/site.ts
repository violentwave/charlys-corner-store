/**
 * Business facts. Only confirmed values live here; unknowns are null + TODO(content).
 * See docs/00-PROJECT-BRIEF.md §6 for open questions.
 */
export const site = {
  name: "Charly's Corner Store",
  legalName: "Charly's Corner Store Tees & Apparel",
  tagline: "Have a Ruffin awesome day",
  city: "Port St. Lucie",
  region: "FL",
  areaServed: "Treasure Coast",
  email: "CHARLYSCORNERSTORE@GMAIL.COM",
  phone: null as string | null, // TODO(content): owner to provide
  address: null as string | null, // TODO(content)
  hours: null as string | null, // TODO(content)
  socials: {} as Partial<Record<"instagram" | "facebook" | "tiktok", string>>, // TODO(content)
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;
