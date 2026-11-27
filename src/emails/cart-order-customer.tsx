import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { COUPON_RULES } from "@/lib/coupons";
import { site } from "@/lib/site";

export interface CartOrderCustomerEmailProps {
  /** Clipped by the route: customer emails never echo free text beyond a short name. */
  name: string;
  orderId: string;
  items: { garmentName: string; colors: string; sizes: string[] }[];
}

/** Customer confirmation for a cart order (2026-11-26): no payment happened yet. */
export function CartOrderCustomerEmail(p: CartOrderCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>We got your order request — we&apos;ll confirm the price</Preview>
      <Body>
        <Container>
          <Heading>We got your order request 🐾</Heading>
          <Text>Hi {p.name},</Text>
          <Text>
            Thanks! Here&apos;s what you sent us (order #{p.orderId.slice(0, 8)}):
            {p.items.map((item, i) => (
              <React.Fragment key={i}>
                <br />
                {i + 1}. {item.garmentName}
                {item.colors ? ` (${item.colors})` : ""} · {item.sizes.join(", ")}
              </React.Fragment>
            ))}
          </Text>
          <Text>
            We&apos;ll look everything over and email you one price for the whole order. Nothing is charged now. You can
            follow it under My designs in your account.
          </Text>
          <Text>
            Pay for your first order and we&apos;ll email you {COUPON_RULES.percentOff}% off your next one ($
            {(COUPON_RULES.minOrderCents / 100).toFixed(0)} minimum).
          </Text>
          <Text>Questions? Reply to this email or reach us at {site.email.toLowerCase()}.</Text>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
