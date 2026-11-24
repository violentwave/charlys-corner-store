import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface ArtworkOwnerEmailProps {
  firstName: string;
  lastName: string;
  email: string;
  orderNumber: string;
  notes?: string | null;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  signedUrl: string;
}

export function ArtworkOwnerEmail(p: ArtworkOwnerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Artwork for order {p.orderNumber}</Preview>
      <Body>
        <Container>
          <Heading>Artwork for order {p.orderNumber}</Heading>
          <Text>
            From: {p.firstName} {p.lastName}
          </Text>
          <Text>Email: {p.email}</Text>
          <Text>Order number: {p.orderNumber}</Text>
          {p.notes ? <Text>Notes: {p.notes}</Text> : null}
          <Text>
            File: {p.fileName} ({(p.sizeBytes / 1024).toFixed(1)} KB, {p.contentType})
          </Text>
          <Text>Download (7-day link): {p.signedUrl}</Text>
        </Container>
      </Body>
    </Html>
  );
}
