import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { site } from "@/lib/site";

export interface AuthTwoFactorEmailProps {
  code: string;
  minutes: number;
  /** "sign-in": a login waiting for this code; "setup": turning on email 2FA. */
  purpose: "sign-in" | "setup";
}

/** 2FA code by email. Carries nothing the visitor typed. */
export function AuthTwoFactorEmail({ code, minutes, purpose }: AuthTwoFactorEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your {site.name} sign-in code is {code}
      </Preview>
      <Body>
        <Container>
          <Heading>Your code: {code}</Heading>
          <Text>
            {purpose === "sign-in"
              ? "Someone (hopefully you) just signed in to your account with the right password. Enter this code to finish."
              : "Enter this code to turn on sign-in codes by email for your account."}{" "}
            It expires in {minutes} minutes.
          </Text>
          <Text>
            {purpose === "sign-in"
              ? "Didn't just sign in? Change your password now: your code stops anyone who only has the password."
              : "Didn't ask for this? You can ignore this email."}
          </Text>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
