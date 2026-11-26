import { Body, Container, Head, Heading, Html, Link, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface MockupOwnerEmailProps {
  email: string;
  name?: string;
  phone?: string;
  garmentName: string;
  /** Zone label + hex for every color zone. */
  colors: { label: string; hex: string; name: string }[];
  /** View label + print-location label for every view with artwork. */
  views: { view: string; area: string; method?: string }[];
  /** Per side, what's printed (bottom → top), from describeLayers(). Optional for older callers. */
  layers?: { view: string; items: string[] }[];
  /** "2 × M" entries for sizes the customer entered (empty when none). */
  sizes: string[];
  notes?: string;
  couponCode: string;
  /** "order" = an order request (owner confirms price + invoices); "mockup" = a mockup lead. */
  kind?: "mockup" | "order";
  /** Every original file, with the sides it's printed on (signed links). */
  artworks: { name: string; contentType: string; size: number; signedUrl: string; usedOn: string[] }[];
  mockups: { view: string; signedUrl: string }[];
  /** Emailed mockups: files are auto-deleted after this many days (src/lib/retention.ts). Orders: kept. */
  filesKeptDays?: number;
  /** Order requests: one-click links to move the order on (src/lib/order-stage.ts). */
  stageLinks?: { label: string; url: string }[];
  /** Order requests: the signed "Set the price" link (P51-3). */
  quoteUrl?: string;
  /** "Order again": this repeats an earlier order request. */
  reorderOf?: string;
}

/** Owner notification for a mockup lead or order request. Free text (name, notes) is clipped by the route before render. */
export function MockupOwnerEmail(p: MockupOwnerEmailProps) {
  const order = p.kind === "order";
  return (
    <Html>
      <Head />
      <Preview>
        {order ? "ORDER REQUEST — " : ""}New {order ? "order request" : "mockup lead"}: {p.garmentName}
      </Preview>
      <Body>
        <Container>
          <Heading>
            {order ? "ORDER REQUEST — " : ""}New {order ? "order request" : "mockup lead"}: {p.garmentName}
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
                {c.label}: {c.name} ({c.hex})
              </React.Fragment>
            ))}
          </Text>
          <Text>
            Print locations:{" "}
            {p.views.map((v, i) => (
              <React.Fragment key={v.view}>
                {i > 0 ? ", " : ""}
                {v.view} — {v.area}
                {v.method ? ` (${v.method})` : ""}
              </React.Fragment>
            ))}
          </Text>
          {p.layers?.map((side) => (
            <Text key={side.view}>
              {side.view} layers:
              {side.items.map((item, i) => (
                <React.Fragment key={i}>
                  <br />
                  {item}
                </React.Fragment>
              ))}
            </Text>
          ))}
          {p.sizes.length > 0 ? <Text>Sizes: {p.sizes.join(", ")}</Text> : null}
          {p.notes ? <Text>Notes: {p.notes}</Text> : null}
          <Text>Coupon code: {p.couponCode}</Text>
          {p.artworks.length === 0 ? <Text>Original artwork: none (text only)</Text> : null}
          {p.artworks.length > 0 ? (
            <Text>Original artwork{p.artworks.length > 1 ? ` (${p.artworks.length} files)` : ""}:</Text>
          ) : null}
          {p.artworks.map((a) => (
            <Text key={a.signedUrl}>
              {a.name} ({a.usedOn.join(", ")}): {(a.size / 1024).toFixed(1)} KB, {a.contentType} —{" "}
              <Link href={a.signedUrl}>{a.signedUrl}</Link>
            </Text>
          ))}
          {p.reorderOf ? <Text>Order again: same design as order {p.reorderOf}.</Text> : null}
          {p.stageLinks && p.stageLinks.length > 0 ? (
            <Text>
              Update the customer (opens a confirm page):
              {p.stageLinks.map((link) => (
                <React.Fragment key={link.url}>
                  <br />
                  <Link href={link.url}>Mark as {link.label}</Link>
                </React.Fragment>
              ))}
            </Text>
          ) : null}
          {p.quoteUrl ? (
            <Text>
              <Link href={p.quoteUrl}>Set the price</Link> (opens a form: price + optional note to the customer)
            </Text>
          ) : null}
          {p.filesKeptDays ? (
            <Text>
              Heads up: these files are deleted automatically after {p.filesKeptDays} days. Download anything you want
              to keep.
            </Text>
          ) : null}
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
