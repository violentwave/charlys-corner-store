/**
 * order.csv for the owner (2026-11-26): one row per design, so a cart order opens as a
 * spreadsheet. Cells are quoted (RFC 4180) and anything a spreadsheet would treat as a formula
 * (= + - @, tab, CR) is prefixed with ' so customer text can't run as a formula.
 */
export type OrderCsvRow = {
  item: number;
  garment: string;
  colors: string;
  sides: string;
  method: string;
  sizes: string;
  pieces: number;
  notes: string;
  mockups: string;
  originals: string;
};

const HEADER: [keyof OrderCsvRow, string][] = [
  ["item", "Item"],
  ["garment", "Garment"],
  ["colors", "Colors"],
  ["sides", "Print locations"],
  ["method", "Print method"],
  ["sizes", "Sizes"],
  ["pieces", "Pieces"],
  ["notes", "Notes"],
  ["mockups", "Mockup links"],
  ["originals", "Original file links"],
];

export function csvCell(value: string | number): string {
  let s = String(value).replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildOrderCsv(rows: OrderCsvRow[]): string {
  const lines = [HEADER.map(([, label]) => csvCell(label)).join(",")];
  for (const row of rows) lines.push(HEADER.map(([key]) => csvCell(row[key])).join(","));
  // BOM so Excel opens it as UTF-8 (emoji, accented names).
  return `﻿${lines.join("\r\n")}\r\n`;
}
