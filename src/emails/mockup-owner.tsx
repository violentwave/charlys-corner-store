import { Body, Container, Head, Heading, Html, Link, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface MockupOwnerEmailProps {
  email: string;
  name?: string;
  phone?: string;
  garmentName: string;
  /** Zone label + hex for every color zone. */
  colors: { label: string; hex: string }[];
  /** View label + print-location label for every view with artwork. */
  views: { view: string; area: string }[];
  /** "2 × M" entries for sizes the visitor entered (empty when none). */
  sizes: string[];
  notes?: string;
  couponCode: string;
  wantsQuote: boolean;
  artwork: { name: string; contentType: string; size: number; signedUrl: string };
  mockups: { view: string; signedUrl: string }[];
}

/** Owner notification for a mockup lead. Free text (name, notes) is clipped by the route before render. */
export function MockupOwnerEmail(p: MockupOwnerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {p.wantsQuote ? "QUOTE REQUESTED — " : ""}New mockup lead: {p.garmentName}
      </Preview>
      <Body>
        <Container>
          <Heading>
            {p.wantsQuote ? "QUOTE REQUESTED — " : ""}New mockup lead: {p.garmentName}
          </Heading>
          <Text>Email: {p.email}</Text>
          {p.name ? <Text>Name: {p.name}</Text> : null}
          {p.phone ? <Text>Phone: {p.phone}</Text> : null}
          <Text>Garment: {p.garmentName}</Text>
          <Text>
            Colors:{" "}
            {p.colors.map((c, i) => (
              <React.Fragment key={c.label}>
                {i > 0 ? ", " : ""}
                {c.label} {c.hex}
              </React.Fragment>
            ))}
          </Text>
          <Text>
            Print locations:{" "}
            {p.views.map((v, i) => (
              <React.Fragment key={v.view}>
                {i > 0 ? ", " : ""}
                {v.view} — {v.area}
              </React.Fragment>
            ))}
          </Text>
          {p.sizes.length > 0 ? <Text>Sizes: {p.sizes.join(", ")}</Text> : null}
          {p.notes ? <Text>Notes: {p.notes}</Text> : null}
          <Text>Coupon code: {p.couponCode}</Text>
          <Text>Original artwork: {p.artwork.name}</Text>
          <Text>
            {(p.artwork.size / 1024).toFixed(1)} KB, {p.artwork.contentType} — {p.artwork.signedUrl}
          </Text>
          <Text>Mockups:</Text>
          {p.mockups.map((m) => (
            <Text key={m.signedUrl}>
              {m.view} — <Link href={m.signedUrl}>{m.signedUrl}</Link>
            </Text>
          ))}
        </Container>
      </Body>
    </Html>
  );
}
