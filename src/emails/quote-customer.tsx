import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { site } from "@/lib/site";

export function QuoteCustomerEmail({ name }: { name: string }) {
  return (
    <Html>
      <Head />
      <Preview>We got your quote request</Preview>
      <Body>
        <Container>
          <Heading>We got your quote request 🐾</Heading>
          <Text>Hi {name},</Text>
          <Text>Thanks for reaching out. We&apos;ll reply with pricing and next steps soon.</Text>
          <Text>Questions? Email {site.email.toLowerCase()}.</Text>
          <Text>{site.tagline}!</Text>
        </Container>
      </Body>
    </Html>
  );
}
