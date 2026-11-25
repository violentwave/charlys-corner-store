import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { site } from "@/lib/site";

export interface AuthVerifyEmailProps {
  code: string;
  minutes: number;
}

/** Email verification code. Carries nothing the visitor typed. */
export function AuthVerifyEmail({ code, minutes }: AuthVerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your {site.name} code is {code}
      </Preview>
      <Body>
        <Container>
          <Heading>Your code: {code}</Heading>
          <Text>Enter this code on the site to confirm your email. It expires in {minutes} minutes.</Text>
          <Text>Didn&apos;t sign up? You can ignore this email.</Text>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
