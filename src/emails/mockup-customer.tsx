import { Body, Container, Head, Heading, Html, Img, Preview, Text } from "@react-email/components";
import * as React from "react";

import { COUPON_RULES } from "@/lib/coupons";
import { site } from "@/lib/site";

export interface MockupCustomerEmailProps {
  /** Clipped by the route: customer emails never echo free text beyond a short name. */
  name: string;
  garmentName: string;
  colors: { label: string; hex: string }[];
  views: { view: string; area: string }[];
  coupon: { code: string; expiresAt: Date; isNew: boolean };
  /** Rendered mockups, inlined via 7-day signed storage URLs. */
  mockups: { view: string; signedUrl: string }[];
}

/** Fixed to the shop's time zone so the printed expiry matches the CouponTicket on screen. */
function formatExpiry(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export function MockupCustomerEmail(p: MockupCustomerEmailProps) {
  const terms = `${COUPON_RULES.percentOff}% off your 2nd order · $${(COUPON_RULES.minOrderCents / 100).toFixed(
    0,
  )} minimum · expires ${formatExpiry(p.coupon.expiresAt)} · one per email`;
  return (
    <Html>
      <Head />
      <Preview>Your mockup is ready + 15% off your 2nd order</Preview>
      <Body>
        <Container>
          <Heading>Your Charly&apos;s mockup is ready 🐾</Heading>
          <Text>Hi {p.name},</Text>
          <Text>
            {p.coupon.isNew
              ? "Here's your mockup, plus 15% off your 2nd order below."
              : "Here's your code again, in case it slipped away."}
          </Text>
          <Text>
            {p.garmentName}
            {p.colors.length > 0 ? ` in ${p.colors.map((c) => c.label).join(", ")}` : ""} · print on{" "}
            {p.views.map((v) => `${v.view.toLowerCase()} (${v.area})`).join(", ")}
          </Text>
          {p.mockups.map((m) => (
            <Img key={m.signedUrl} src={m.signedUrl} alt={`Your ${p.garmentName.toLowerCase()} mockup — ${m.view}`} />
          ))}
          <Text>
            Coupon code: <strong>{p.coupon.code}</strong>
          </Text>
          <Text>{terms}</Text>
          <Text>Ready to print it? Reply to this email or request a quote and we&apos;ll take it from here.</Text>
          <Text>Questions? Email {site.email.toLowerCase()}.</Text>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
