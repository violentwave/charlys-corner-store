import { Body, Button, Container, Head, Heading, Html, Img, Preview, Text } from "@react-email/components";
import * as React from "react";

import { MOCKUP_FILES_RETENTION_DAYS } from "@/lib/retention";

import { COUPON_RULES } from "@/lib/coupons";
import { site } from "@/lib/site";

export interface MockupCustomerEmailProps {
  /** Clipped by the route: customer emails never echo free text beyond a short name. */
  name: string;
  garmentName: string;
  /** Zone label ("Sleeves & collar") + palette name ("Navy" or "Custom #rrggbb"). */
  colors: { label: string; hex: string; name: string }[];
  views: { view: string; area: string; method?: string }[];
  /** Rendered mockups, inlined via 7-day signed storage URLs (the PNGs are also attached, so they outlive the links). */
  mockups: { view: string; signedUrl: string }[];
  /** Deep link: /?mockup=<id>#design restores this design in the builder (design data only, no PII). */
  mockupId: string;
}

export function MockupCustomerEmail(p: MockupCustomerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your mockup is ready</Preview>
      <Body>
        <Container>
          <Heading>Your Charly&apos;s mockup is ready 🐾</Heading>
          <Text>Hi {p.name},</Text>
          <Text>Here&apos;s your mockup.</Text>
          <Text>
            {p.garmentName}
            {p.colors.length === 1
              ? ` in ${p.colors[0]!.name}`
              : p.colors.length > 1
                ? ` (${p.colors.map((c) => `${c.label.toLowerCase()}: ${c.name}`).join(", ")})`
                : ""}{" "}
            · print on{" "}
            {p.views.map((v) => `${v.view.toLowerCase()} (${v.area}${v.method ? `, ${v.method}` : ""})`).join(", ")}
          </Text>
          {p.mockups.map((m) => (
            <Img key={m.signedUrl} src={m.signedUrl} alt={`Your ${p.garmentName.toLowerCase()} mockup — ${m.view}`} />
          ))}
          <Text>
            Your mockups are attached to this email. We keep your design files for {MOCKUP_FILES_RETENTION_DAYS} days,
            so save anything you want to keep.
          </Text>
          <Text>
            Order and pay once, and we&apos;ll email you {COUPON_RULES.percentOff}% off your next order ($
            {(COUPON_RULES.minOrderCents / 100).toFixed(0)} minimum).
          </Text>
          <Button
            href={`${site.url}/?mockup=${p.mockupId}#design`}
            style={{
              backgroundColor: "#FF2E97",
              borderRadius: "999px",
              color: "#0A0A14",
              fontWeight: 600,
              padding: "12px 24px",
              textDecoration: "none",
            }}
          >
            Order this design
          </Button>
          <Text>
            Or pick up where you left off — that button reopens your design in our mockup builder, ready to tweak or
            share.
          </Text>
          <Text>Ready to print it? Reply to this email or request a quote and we&apos;ll take it from here.</Text>
          <Text>Questions? Email {site.email.toLowerCase()}.</Text>
          <Text>{site.tagline}! 🐾</Text>
        </Container>
      </Body>
    </Html>
  );
}
