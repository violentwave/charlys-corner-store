import type { Metadata, Viewport } from "next";
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource-variable/orbitron";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `Custom T-Shirts & Screen Printing in ${site.city}, ${site.region} | ${site.name}`,
    template: `%s | ${site.name}`,
  },
  description: `Custom tees, hats, hoodies, and promo products printed in ${site.city}, ${site.region}. Design your own mockup online. ${site.tagline}!`,
};

export const viewport: Viewport = {
  themeColor: "#0a0a14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
