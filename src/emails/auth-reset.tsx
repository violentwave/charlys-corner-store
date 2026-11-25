import { Body, Container, Head, Heading, Html, Link, Preview, Text } from "@react-email/components";
import * as React from "react";

import { site } from "@/lib/site";

export interface AuthResetEmailProps {
  url: string;
  minutes: number;
}

/** Password reset link. Carries nothing the visitor typed. */
export function AuthResetEmail({ url, minutes }: AuthResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your {site.name} password</Preview>
      <Body>
        <Container>
          <Heading>Reset your password</Heading>
          <Text>
            <Link href={url}>Choose a new password</Link> (this link works once and expires in {minutes} minutes).
          </Text>
          <Text>Didn&apos;t ask for this? You can ignore this email; your password hasn&apos;t changed.</Text>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
