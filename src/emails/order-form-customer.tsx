import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface OrderFormCustomerEmailProps {
  firstName: string;
  fileCount: number;
  orderType: "new" | "existing";
}

export function OrderFormCustomerEmail(p: OrderFormCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Got your order, {p.firstName} 🐾</Preview>
      <Body>
        <Container>
          <Heading>Got it, {p.firstName}!</Heading>
          <Text>
            {p.orderType === "existing" ? "We attached your artwork to your order." : "We got your order request."}{" "}
            We&apos;ll be in touch soon with a price and any questions.
          </Text>
          {p.fileCount > 0 ? <Text>Files received: {p.fileCount}.</Text> : null}
          <Text>Have a Ruffin awesome day.</Text>
        </Container>
      </Body>
    </Html>
  );
}
