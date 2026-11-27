import { Body, Container, Head, Heading, Html, Link, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface OrderFormOwnerEmailProps {
  orderType: "new" | "existing";
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  orderNumber: string | null;
  fulfillment: "pickup" | "ship" | null;
  address: { street?: string; unit?: string; city?: string; state?: string; zip?: string } | null;
  items: string[];
  otherItem: boolean;
  colors: string | null;
  printMethod: string | null;
  printLocations: string[];
  sizes: Record<string, number>;
  neededBy: string | null;
  notes: string | null;
  files: { name: string; contentType: string; size: number; signedUrl: string }[];
  referralSource?: string;
  referralOther?: string;
  marketingOptIn: boolean;
}

const ROWS = (p: OrderFormOwnerEmailProps): [string, string][] => [
  ["Order type", p.orderType === "new" ? "New order" : "Existing order"],
  ["First name", p.firstName],
  ["Last name", p.lastName ?? "—"],
  ["Email", p.email],
  ["Phone", p.phone ?? "—"],
  ["Company / team", p.company ?? "—"],
  ["Order number", p.orderNumber ?? "—"],
  [
    "Fulfillment",
    p.fulfillment === "pickup" ? "Pickup in Port St. Lucie" : p.fulfillment === "ship" ? "Ship to me" : "—",
  ],
  ["Street", p.address?.street ?? "—"],
  ["Apt / suite", p.address?.unit ?? "—"],
  ["City", p.address?.city ?? "—"],
  ["State", p.address?.state ?? "—"],
  ["ZIP", p.address?.zip ?? "—"],
  ["Item types", [...p.items, p.otherItem ? "Other (see notes)" : null].filter(Boolean).join(", ") || "—"],
  ["Garment color(s)", p.colors ?? "—"],
  ["Print method", p.printMethod ?? "—"],
  ["Print locations", p.printLocations.join(", ") || "—"],
  ["Needed by", p.neededBy ?? "—"],
  [
    "How did you hear about us?",
    p.referralSource ? `${p.referralSource}${p.referralOther ? ` — ${p.referralOther}` : ""}` : "—",
  ],
  ["Marketing opt-in", p.marketingOptIn ? "Yes" : "No"],
  ["Notes", p.notes ?? "—"],
];

export function OrderFormOwnerEmail(p: OrderFormOwnerEmailProps) {
  const subject =
    p.orderType === "existing"
      ? `ARTWORK for order #${p.orderNumber || "—"}: ${p.firstName} · ${p.email}`
      : `NEW ORDER (form): ${p.firstName} · ${p.email}`;
  const sizeEntries = Object.entries(p.sizes).filter(([, q]) => q > 0);
  const total = sizeEntries.reduce((s, [, q]) => s + q, 0);
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body>
        <Container>
          <Heading>{subject}</Heading>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {ROWS(p).map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: "4px 8px 4px 0", fontWeight: 600, verticalAlign: "top", width: "160px" }}>
                    {label}
                  </td>
                  <td style={{ padding: "4px 0", verticalAlign: "top" }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sizeEntries.length > 0 ? (
            <>
              <Heading as="h2">Sizes</Heading>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>Size</th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeEntries.map(([size, qty]) => (
                    <tr key={size}>
                      <td style={{ padding: "4px 8px" }}>{size}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{qty}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: "4px 8px", fontWeight: 600 }}>Total</td>
                    <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{total}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : null}
          {p.files.length > 0 ? (
            <>
              <Heading as="h2">Files</Heading>
              {p.files.map((f, i) => (
                <Text key={i}>
                  {f.name} ({(f.size / 1024).toFixed(1)} KB, {f.contentType}) —{" "}
                  <Link href={f.signedUrl}>{f.signedUrl}</Link>
                </Text>
              ))}
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
