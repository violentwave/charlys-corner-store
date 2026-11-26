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
    // Hosts from Square's "Content Security Policy" page (Web Payments SDK), checked 2026-11-26.
    const sdkHost = sandbox ? "https://sandbox.web.squarecdn.com" : "https://web.squarecdn.com";
    const scriptSrc = sdkHost;
    const frameSrc = sdkHost;
    const connectSrc = `${sdkHost} ${
      sandbox ? "https://pci-connect.squareupsandbox.com" : "https://pci-connect.squareup.com"
    } https://o160250.ingest.sentry.io`;
    const squareFonts = "https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net";
    // Signed storage URLs (R2 / MinIO, path-style) show mockup thumbnails, downloads and the
    // brand-kit logo on /account: without this origin the CSP would block them in production.
    let storageOrigin = "";
    try {
      storageOrigin = process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : "";
    } catch {
      storageOrigin = "";
    }
    const dev = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} ${scriptSrc} https://challenges.cloudflare.com`,
      `style-src 'self' 'unsafe-inline' ${sdkHost}`,
      `img-src 'self' data: blob: ${storageOrigin}`.trim(),
      `font-src 'self' data: ${squareFonts}`,
      `frame-src 'self' ${frameSrc} https://challenges.cloudflare.com`,
      `connect-src 'self' ${connectSrc} https://challenges.cloudflare.com ${storageOrigin}${dev ? " ws://localhost:*" : ""} data: blob:`,
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
