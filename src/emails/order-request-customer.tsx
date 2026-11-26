import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { COUPON_RULES } from "@/lib/coupons";
import { site } from "@/lib/site";

export interface OrderRequestCustomerEmailProps {
  /** Clipped by the route: customer emails never echo free text beyond a short name. */
  name: string;
  garmentName: string;
  colors: { label: string; hex: string; name: string }[];
  views: { view: string; area: string; method?: string }[];
  /** "2 × M" entries for the sizes the customer ordered. */
  sizes: string[];
  coupon: { code: string; expiresAt: Date; isNew: boolean };
  /** Deep link: /?mockup=<id>#design reopens the design in the builder (design data only, no PII). */
  mockupId: string;
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

/** Customer confirmation for an "Order this design" request (v2): no payment happened. */
export function OrderRequestCustomerEmail(p: OrderRequestCustomerEmailProps) {
  const terms = `${COUPON_RULES.percentOff}% off your 2nd order · $${(COUPON_RULES.minOrderCents / 100).toFixed(
    0,
  )} minimum · expires ${formatExpiry(p.coupon.expiresAt)} · one per email`;
  return (
    <Html>
      <Head />
      <Preview>We got your order request — we&apos;ll confirm the price and send an invoice</Preview>
      <Body>
        <Container>
          <Heading>We got your order request 🐾</Heading>
          <Text>Hi {p.name},</Text>
          <Text>
            Thanks for sending us your {p.garmentName.toLowerCase()}
            {p.colors.length > 0
              ? ` (${p.colors.map((c) => `${c.label.toLowerCase()}: ${c.name}`).join(", ")})`
              : ""} —{" "}
            {p.views.map((v) => `${v.view.toLowerCase()} (${v.area}${v.method ? `, ${v.method}` : ""})`).join(", ")}
            {p.sizes.length > 0 ? <> · {p.sizes.join(", ")}</> : null}.
          </Text>
          <Text>We&apos;ll confirm the price and send you an invoice — nothing is charged now.</Text>
          <Text>
            Coupon code: <strong>{p.coupon.code}</strong>
          </Text>
          <Text>{terms}</Text>
          <Button
            href={`${site.url}/?mockup=${p.mockupId}#design`}
            style={{
              backgroundColor: "#FF2E97",
              borderRadius: "999px",
              color: "#0A0A14",
              fontWeight: 600,
              padding: "12px 24px",
              textDecoration: "none",
            }}
          >
            View your design
          </Button>
          <Text>Questions? Reply to this email or reach us at {site.email.toLowerCase()}.</Text>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
