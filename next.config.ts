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
  async headers() {
    // Web Payments SDK (P51-4) is loaded only on these routes; Square's CSP doc lists
    // the exact script/frame/connect hosts for sandbox + production.
    const sandbox = process.env.SQUARE_ENVIRONMENT !== "production";
    const scriptSrc = sandbox
      ? "https://sandbox.web.squarecdn.com https://js.squareup.com"
      : "https://web.squarecdn.com https://js.squareup.com";
    const frameSrc = sandbox ? "https://sandbox.web.squarecdn.com" : "https://web.squarecdn.com";
    const connectSrc = sandbox
      ? "https://pci-connect.squareupsandbox.com https://connect.squareupsandbox.com"
      : "https://pci-connect.squareup.com https://connect.squareup.com";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${scriptSrc} https://challenges.cloudflare.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `frame-src 'self' ${frameSrc} https://challenges.cloudflare.com`,
      `connect-src 'self' ${connectSrc} https://challenges.cloudflare.com${process.env.NODE_ENV === "development" ? " ws://localhost:*" : ""} data: blob:`,
    ].join("; ");
    return [
      { source: "/account/:path*", headers: [{ key: "Content-Security-Policy", value: csp }] },
      { source: "/pay/:path*", headers: [{ key: "Content-Security-Policy", value: csp }] },
    ];
  },
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
