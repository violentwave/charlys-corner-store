/**
 * Fonts offered by the builder's text tool (decided 2026-11-25). All free for commercial use,
 * embedding and printing (SIL OFL 1.1; Permanent Marker is Apache 2.0), self-hosted via
 * @fontsource packages like the site fonts (CSS: src/components/builder/text-fonts.css). The server only accepts these ids; the owner email names the font so
 * production can set the same type.
 */
export type TextFont = {
  id: string;
  label: string;
  /** CSS font-family once the @fontsource package is imported. */
  family: string;
  /** The weight the builder renders and production should use. */
  weight: number;
  /** npm package that self-hosts it (import "<package>/<weight>.css"). */
  fontsource: string;
  style: "block" | "condensed" | "varsity" | "script" | "marker" | "serif" | "sans";
};

export const TEXT_FONTS = [
  { id: "anton", label: "Anton", family: "Anton", weight: 400, fontsource: "@fontsource/anton", style: "condensed" },
  {
    id: "bebas-neue",
    label: "Bebas Neue",
    family: "Bebas Neue",
    weight: 400,
    fontsource: "@fontsource/bebas-neue",
    style: "condensed",
  },
  {
    id: "oswald",
    label: "Oswald",
    family: "Oswald",
    weight: 600,
    fontsource: "@fontsource/oswald",
    style: "condensed",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    family: "Montserrat",
    weight: 800,
    fontsource: "@fontsource/montserrat",
    style: "sans",
  },
  {
    id: "graduate",
    label: "Graduate (varsity)",
    family: "Graduate",
    weight: 400,
    fontsource: "@fontsource/graduate",
    style: "varsity",
  },
  {
    id: "permanent-marker",
    label: "Permanent Marker",
    family: "Permanent Marker",
    weight: 400,
    fontsource: "@fontsource/permanent-marker",
    style: "marker",
  },
  {
    id: "pacifico",
    label: "Pacifico",
    family: "Pacifico",
    weight: 400,
    fontsource: "@fontsource/pacifico",
    style: "script",
  },
  {
    id: "playfair-display",
    label: "Playfair Display",
    family: "Playfair Display",
    weight: 700,
    fontsource: "@fontsource/playfair-display",
    style: "serif",
  },
] as const satisfies readonly TextFont[];

export type TextFontId = (typeof TEXT_FONTS)[number]["id"];
export const TEXT_FONT_IDS = TEXT_FONTS.map((f) => f.id) as [TextFontId, ...TextFontId[]];

export function getTextFont(id: string): TextFont | undefined {
  return TEXT_FONTS.find((f) => f.id === id);
}
