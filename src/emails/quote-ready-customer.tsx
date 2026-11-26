import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface QuoteReadyCustomerEmailProps {
  garmentName: string;
  priceCents: number;
  note: string | null;
  /** Null while online payment isn't switched on: the shop sends payment details itself. */
  payUrl: string | null;
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
          {p.payUrl ? (
            <>
              <Button
                href={p.payUrl}
                style={{
                  backgroundColor: "#FF2E97",
                  borderRadius: "999px",
                  color: "#0A0A14",
                  fontWeight: 600,
                  padding: "12px 24px",
                  textDecoration: "none",
                }}
              >
                Pay now
              </Button>
              <Text>
                Pay by card, Apple Pay, Google Pay, Cash App Pay or Afterpay. Signed in? It&apos;s also under My
                designs.
              </Text>
            </>
          ) : (
            <Text>We&apos;ll send you payment details shortly.</Text>
          )}
        </Container>
      </Body>
    </Html>
  );
}
