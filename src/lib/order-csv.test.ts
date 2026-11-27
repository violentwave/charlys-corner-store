import { describe, expect, it } from "vitest";

import { buildOrderCsv, csvCell } from "./order-csv";

describe("order csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line 1\r\nline 2")).toBe('"line 1\nline 2"');
    expect(csvCell(12)).toBe("12");
  });

  it("neutralises formulas from customer text", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("one header row plus one row per item, Excel-friendly", () => {
    const csv = buildOrderCsv([
      {
        item: 1,
        garment: "Classic tee",
        colors: "Body: Black",
        sides: "Front: Full front",
        method: "Screen print",
        sizes: "2 × M, 1 × L",
        pieces: 3,
        notes: "",
        mockups: "https://x/front.png",
        originals: "https://x/art.png",
      },
    ]);
    expect(csv.startsWith("﻿Item,Garment,")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '1,Classic tee,Body: Black,Front: Full front,Screen print,"2 × M, 1 × L",3,,https://x/front.png,https://x/art.png',
    );
  });
});
