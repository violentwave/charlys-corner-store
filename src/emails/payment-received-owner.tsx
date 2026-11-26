import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface PaymentReceivedOwnerEmailProps {
  garmentName: string;
  amountCents: number;
  mockupId: string;
}

export function PaymentReceivedOwnerEmail(p: PaymentReceivedOwnerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Paid: ${(p.amountCents / 100).toFixed(2)} · {p.garmentName}
      </Preview>
      <Body>
        <Container>
          <Heading>Paid: ${(p.amountCents / 100).toFixed(2)}</Heading>
          <Text>
            {p.garmentName} · order #{p.mockupId.slice(0, 8)}
          </Text>
          <Text>Have a Ruffin awesome day.</Text>
        </Container>
      </Body>
    </Html>
  );
}
