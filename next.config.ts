import type { NextConfig } from "next";

/** Old Weebly URLs → new routes (permanent, keeps search ranking). See docs/01 Migration tasks. */
export const legacyRedirects = [
  { source: "/index.html", destination: "/" },
  { source: "/product.html", destination: "/shop" },
  { source: "/about.html", destination: "/about" },
  { source: "/custom-image-uploader.html", destination: "/upload" },
  { source: "/business--promotional-products.html", destination: "/business" },
  { source: "/design-your-own-shirt.html", destination: "/design" },
] as const;

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    return legacyRedirects.map((r) => ({ ...r, permanent: true }));
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
