import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

import { site } from "@/lib/site";

export interface ContactCustomerEmailProps {
  name: string;
  message: string;
}

export function ContactCustomerEmail({ name, message }: ContactCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>We got your message</Preview>
      <Body>
        <Container>
          <Heading>We got your message 🐾</Heading>
          <Text>Hi {name},</Text>
          <Text>Thanks for reaching out to {site.name}. We&apos;ll reply to your message soon.</Text>
          <Text>Here&apos;s a copy of what you sent:</Text>
          <Section>
            <Text>{message}</Text>
          </Section>
          <Text>Questions? Email us at {site.email.toLowerCase()}.</Text>
          <Text>{site.tagline}!</Text>
        </Container>
      </Body>
    </Html>
  );
}
