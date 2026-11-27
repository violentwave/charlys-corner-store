import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { COUPON_RULES } from "@/lib/coupons";
import { site } from "@/lib/site";

export interface PaymentReceivedCustomerEmailProps {
  garmentName: string;
  amountCents: number;
  /** Set on the customer's first paid order: their one 15% code (Logan, 2026-11-26). */
  coupon: { code: string; expiresAt: Date } | null;
}

export function PaymentReceivedCustomerEmail(p: PaymentReceivedCustomerEmailProps) {
  const expires = p.coupon?.expiresAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
  return (
    <Html>
      <Head />
      <Preview>
        Payment received for your {p.garmentName}
        {p.coupon ? ` + ${COUPON_RULES.percentOff}% off your next order` : ""}
      </Preview>
      <Body>
        <Container>
          <Heading>Payment received 🐾</Heading>
          <Text>
            We got your payment of ${(p.amountCents / 100).toFixed(2)} for your {p.garmentName} order. We&apos;ll keep
            you posted as it moves along.
          </Text>
          {p.coupon ? (
            <>
              <Text>Thanks for your first order! Here&apos;s {COUPON_RULES.percentOff}% off your next one:</Text>
              <Text>
                Coupon code: <strong>{p.coupon.code}</strong>
              </Text>
              <Text>
                {COUPON_RULES.percentOff}% off · ${(COUPON_RULES.minOrderCents / 100).toFixed(0)} minimum · expires{" "}
                {expires} · one per customer. It&apos;s applied for you at checkout.
              </Text>
            </>
          ) : null}
          <Button
            href={`${site.url}/account#designs`}
            style={{
              backgroundColor: "#FF2E97",
              borderRadius: "999px",
              color: "#0A0A14",
              fontWeight: 600,
              padding: "12px 24px",
              textDecoration: "none",
            }}
          >
            See your orders
          </Button>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
