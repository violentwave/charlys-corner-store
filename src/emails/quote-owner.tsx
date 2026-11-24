import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

import type { QuoteInput } from "@/lib/schemas";

export interface QuoteOwnerEmailProps extends QuoteInput {
  files: { name: string; contentType: string; size: number; signedUrl: string }[];
}

export function QuoteOwnerEmail(p: QuoteOwnerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Quote request from {p.name}</Preview>
      <Body>
        <Container>
          <Heading>Quote request from {p.name}</Heading>
          <Text>Email: {p.email}</Text>
          {p.phone ? <Text>Phone: {p.phone}</Text> : null}
          {p.company ? <Text>Company: {p.company}</Text> : null}
          <Text>What they need: {p.items}</Text>
          {p.quantity ? <Text>Quantity: {p.quantity}</Text> : null}
          {p.neededBy ? <Text>Needed by: {p.neededBy}</Text> : null}
          {p.notes ? <Text>Notes: {p.notes}</Text> : null}
          {p.files.length > 0 ? <Text>Artwork ({p.files.length}):</Text> : null}
          {p.files.map((file) => (
            <Text key={file.signedUrl}>
              {file.name} ({(file.size / 1024).toFixed(1)} KB, {file.contentType}) — {file.signedUrl}
            </Text>
          ))}
        </Container>
      </Body>
    </Html>
  );
}
