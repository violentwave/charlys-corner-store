import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TEXT_FONTS } from "./text-fonts";

describe("TEXT_FONTS", () => {
  it("has unique ids and each font's CSS weight is imported by the builder", () => {
    expect(new Set(TEXT_FONTS.map((f) => f.id)).size).toBe(TEXT_FONTS.length);
    const css = readFileSync("src/components/builder/text-fonts.css", "utf8");
    for (const f of TEXT_FONTS) expect(css).toContain(`@import "${f.fontsource}/${f.weight}.css";`);
  });
});
