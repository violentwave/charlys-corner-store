import { Body, Button, Container, Head, Heading, Html, Link, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface QuoteReadyCustomerEmailProps {
  garmentName: string;
  priceCents: number;
  note: string | null;
  payUrl: string;
}

export function QuoteReadyCustomerEmail(p: QuoteReadyCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your price is ready — {p.garmentName}</Preview>
      <Body>
        <Container>
          <Heading>Your price is ready 🐾</Heading>
          <Text>
            We priced your {p.garmentName} order at ${(p.priceCents / 100).toFixed(2)}.
          </Text>
          {p.note ? <Text>{p.note}</Text> : null}
          <Button href={p.payUrl}>Pay now</Button>
          <Text>Pay by card, Apple Pay, Google Pay, Cash App Pay or Afterpay.</Text>
        </Container>
      </Body>
    </Html>
  );
}
