import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import { site } from "@/lib/site";

export interface OrderStatusCustomerEmailProps {
  /** Clipped by the route (short name only). */
  name: string;
  garmentName: string;
  stageLabel: string;
  /** Fixed copy from src/lib/order-stage.ts. */
  description: string;
}

/** "Your order is now: Ready" (2026-11-26). Carries nothing anyone typed beyond a short name. */
export function OrderStatusCustomerEmail(p: OrderStatusCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your {p.garmentName.toLowerCase()} order: {p.stageLabel}
      </Preview>
      <Body>
        <Container>
          <Heading>Your order: {p.stageLabel}</Heading>
          <Text>Hi {p.name},</Text>
          <Text>{p.description}</Text>
          <Button
            href={`${site.url}/account#designs`}
            style={{
              backgroundColor: "#FF2E97",
              borderRadius: "999px",
              color: "#0A0A14",
              fontWeight: 600,
              padding: "12px 24px",
              textDecoration: "none",
            }}
          >
            See your orders
          </Button>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
