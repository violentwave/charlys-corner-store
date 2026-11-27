import { Body, Container, Head, Heading, Html, Img, Link, Preview, Text } from "@react-email/components";
import * as React from "react";

export interface CartOrderOwnerItem {
  garmentName: string;
  colors: { label: string; name: string; hex: string }[];
  views: { view: string; area: string; method?: string }[];
  /** Per side, what's printed (bottom → top), from describeLayers(). */
  layers: { view: string; items: string[] }[];
  sizes: string[];
  pieces: number;
  /** Clipped by the route. */
  notes?: string;
  mockups: { view: string; signedUrl: string }[];
  artworks: { name: string; size: number; signedUrl: string; usedOn: string[] }[];
}

export interface CartOrderOwnerEmailProps {
  orderId: string;
  email: string;
  name?: string;
  /** Order-level notes (clipped by the route). */
  notes?: string;
  items: CartOrderOwnerItem[];
  stageLinks: { label: string; url: string }[];
  quoteUrl: string;
}

const cell: React.CSSProperties = {
  border: "1px solid #d0d0dc",
  padding: "6px 8px",
  verticalAlign: "top",
  fontSize: "13px",
  lineHeight: "1.4",
};
const head: React.CSSProperties = { ...cell, background: "#f0f0f6", fontWeight: 600, textAlign: "left" };

/**
 * Owner email for a cart order (2026-11-26): laid out like a spreadsheet, one row per design,
 * with every side's mockup and every original file. order.csv (same rows) is attached.
 */
export function CartOrderOwnerEmail(p: CartOrderOwnerEmailProps) {
  const pieces = p.items.reduce((n, i) => n + i.pieces, 0);
  const title = `ORDER REQUEST — ${p.items.length} design${p.items.length === 1 ? "" : "s"}, ${pieces} pcs`;
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", color: "#14141f" }}>
        <Container style={{ maxWidth: "960px" }}>
          <Heading as="h2">{title}</Heading>
          <Text>
            Order #{p.orderId.slice(0, 8)} · {p.email}
            {p.name ? ` · ${p.name}` : ""}
          </Text>
          {p.notes ? <Text>Order notes: {p.notes}</Text> : null}
          <table cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["#", "Garment", "Colors", "Print locations", "Sizes", "Pcs", "Notes", "Mockups", "Originals"].map(
                  (h) => (
                    <th key={h} style={head}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {p.items.map((item, i) => (
                <tr key={i}>
                  <td style={cell}>{i + 1}</td>
                  <td style={cell}>{item.garmentName}</td>
                  <td style={cell}>
                    {item.colors.map((c) => (
                      <div key={c.label}>
                        {c.label}: {c.name} ({c.hex})
                      </div>
                    ))}
                  </td>
                  <td style={cell}>
                    {item.views.map((v) => (
                      <div key={v.view}>
                        <strong>{v.view}</strong>: {v.area}
                        {v.method ? ` · ${v.method}` : ""}
                        {item.layers
                          .find((l) => l.view === v.view)
                          ?.items.map((line, j) => (
                            <div key={j} style={{ color: "#5a5a70", fontSize: "12px" }}>
                              {line}
                            </div>
                          ))}
                      </div>
                    ))}
                  </td>
                  <td style={cell}>
                    {item.sizes.map((s) => (
                      <div key={s}>{s}</div>
                    ))}
                  </td>
                  <td style={cell}>{item.pieces}</td>
                  <td style={cell}>{item.notes ?? ""}</td>
                  <td style={cell}>
                    {item.mockups.map((m) => (
                      <div key={m.signedUrl} style={{ marginBottom: "6px" }}>
                        <Link href={m.signedUrl}>
                          <Img src={m.signedUrl} width="96" alt={`${item.garmentName} ${m.view}`} />
                        </Link>
                        <div style={{ fontSize: "12px" }}>{m.view}</div>
                      </div>
                    ))}
                  </td>
                  <td style={cell}>
                    {item.artworks.length === 0 ? "Text only" : null}
                    {item.artworks.map((a) => (
                      <div key={a.signedUrl}>
                        <Link href={a.signedUrl}>{a.name}</Link> ({(a.size / 1024).toFixed(0)} KB
                        {a.usedOn.length ? `, ${a.usedOn.join(", ")}` : ""})
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Text>
            <Link href={p.quoteUrl}>Set the price</Link> for the whole order (opens a form: price + optional note).
          </Text>
          <Text>
            Update the customer (opens a confirm page):
            {p.stageLinks.map((link) => (
              <React.Fragment key={link.url}>
                <br />
                <Link href={link.url}>Mark as {link.label}</Link>
              </React.Fragment>
            ))}
          </Text>
          <Text style={{ color: "#5a5a70", fontSize: "12px" }}>
            order.csv is attached (same rows, opens in Excel or Google Sheets). File links work for 7 days; the files
            themselves are kept.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
