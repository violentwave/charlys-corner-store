import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { site } from "@/lib/site";

export interface ArtworkCustomerEmailProps {
  firstName: string;
  fileName: string;
  orderNumber: string;
}

export function ArtworkCustomerEmail({ firstName, fileName, orderNumber }: ArtworkCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>We got your artwork</Preview>
      <Body>
        <Container>
          <Heading>We got your artwork 🐾</Heading>
          <Text>Hi {firstName},</Text>
          <Text>
            We attached {fileName} to order {orderNumber}. We&apos;ll be in touch if we need anything else.
          </Text>
          <Text>Questions? Email {site.email.toLowerCase()}.</Text>
          <Text>{site.tagline}!</Text>
        </Container>
      </Body>
    </Html>
  );
}
