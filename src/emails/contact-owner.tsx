import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

export interface ContactOwnerEmailProps {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  sourcePage: "about" | "contact";
  referralSource?: string | null;
  referralOther?: string | null;
}

export function ContactOwnerEmail({
  name,
  email,
  phone,
  message,
  sourcePage,
  referralSource,
  referralOther,
}: ContactOwnerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        New message from {name} ({sourcePage})
      </Preview>
      <Body>
        <Container>
          <Heading>New message from {name}</Heading>
          <Text>Source page: {sourcePage}</Text>
          <Text>Email: {email}</Text>
          {phone ? <Text>Phone: {phone}</Text> : null}
          <Text>Message:</Text>
          <Section>
            <Text>{message}</Text>
          </Section>
          {referralSource ? (
            <Text>
              Referral: {referralSource}
              {referralOther ? ` — ${referralOther}` : ""}
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
