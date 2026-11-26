import { Body, Container, Head, Heading, Html, Link, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface PaymentReceivedCustomerEmailProps {
  garmentName: string;
  amountCents: number;
  unlockedCoupon: boolean;
}

export function PaymentReceivedCustomerEmail(p: PaymentReceivedCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Payment received — {p.garmentName}</Preview>
      <Body>
        <Container>
          <Heading>Payment received 🐾</Heading>
          <Text>
            We got your payment of ${(p.amountCents / 100).toFixed(2)} for your {p.garmentName} order.
          </Text>
          {p.unlockedCoupon ? <Text>Your 15% off your 2nd order is now unlocked — check your account.</Text> : null}
          <Text>Have a Ruffin awesome day.</Text>
        </Container>
      </Body>
    </Html>
  );
}
