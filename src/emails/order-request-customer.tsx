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
  /** Deep link: /?mockup=<id>#design reopens the design in the builder (design data only, no PII). */
  mockupId: string;
}

/** Customer confirmation for an "Order this design" request (v2): no payment happened. */
export function OrderRequestCustomerEmail(p: OrderRequestCustomerEmailProps) {
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
            Order and pay once, and we&apos;ll email you {COUPON_RULES.percentOff}% off your next order ($
            {(COUPON_RULES.minOrderCents / 100).toFixed(0)} minimum).
          </Text>
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
