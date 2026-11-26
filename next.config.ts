import type { NextConfig } from "next";

/** Old Weebly URLs → new routes (permanent, keeps search ranking). See docs/01 Migration tasks. */
export const legacyRedirects = [
  { source: "/index.html", destination: "/" },
  { source: "/product.html", destination: "/shop" },
  { source: "/about.html", destination: "/about" },
  { source: "/custom-image-uploader.html", destination: "/#upload" },
  { source: "/business--promotional-products.html", destination: "/business" },
  { source: "/design-your-own-shirt.html", destination: "/#design" },
] as const;

/** Hybrid one-page Home (2026-11-26): only the builder and uploader live only on Home. */
export const appRedirects = [
  { source: "/design", destination: "/#design" },
  { source: "/upload", destination: "/#upload" },
] as const;

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    return [...legacyRedirects, ...appRedirects].map((r) => ({ ...r, permanent: true }));
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
