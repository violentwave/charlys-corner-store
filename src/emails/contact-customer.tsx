import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { site } from "@/lib/site";

export interface ContactCustomerEmailProps {
  name: string;
}

/** Deliberately does NOT echo the visitor's message: confirmations must not carry free text
 * (otherwise the form could be used to send arbitrary content to any address). */
export function ContactCustomerEmail({ name }: ContactCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>We got your message</Preview>
      <Body>
        <Container>
          <Heading>We got your message 🐾</Heading>
          <Text>Hi {name},</Text>
          <Text>Thanks for reaching out to {site.name}. We&apos;ll reply to your message soon.</Text>
          <Text>Questions? Email us at {site.email.toLowerCase()}.</Text>
          <Text>{site.tagline}!</Text>
        </Container>
      </Body>
    </Html>
  );
}
