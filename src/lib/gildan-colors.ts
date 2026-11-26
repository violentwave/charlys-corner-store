/**
 * Gildan blank colors for the builder's color strip (docs/04 §2, decided 2026-11-25:
 * "every Gildan blank color, sorted by hue"). Names are Gildan's; hex values come from
 * published Gildan swatch charts (Pantone-matched) and are screen approximations.
 * Entries marked `approx: true` had no published hex and were matched by eye.
 *
 * TODO(content): owner confirms which Gildan styles he stocks per garment (Brief §6);
 * colors vary by style. Tee/raglan/polo/tank use the 5000 list until he does.
 */
import type { GarmentColor } from "./garments";

/** Gildan 5000 Heavy Cotton tee. */
export const GILDAN_5000: GarmentColor[] = [
  { name: "White", hex: "#ffffff" },
  { name: "Natural", hex: "#e7ceb5" },
  { name: "Off White", hex: "#f2efe6", approx: true },
  { name: "Ice Grey", hex: "#d7d2cb" },
  { name: "Ash", hex: "#c8c9c7" },
  { name: "Sport Grey", hex: "#97999b" },
  { name: "Gravel", hex: "#888b8d" },
  { name: "Graphite Heather", hex: "#707372" },
  { name: "Charcoal", hex: "#66676c" },
  { name: "Tweed", hex: "#4b4f54" },
  { name: "Dark Heather", hex: "#425563" },
  { name: "Black", hex: "#25282a" },
  { name: "Sand", hex: "#cabfad" },
  { name: "Prairie Dust", hex: "#7a7256" },
  { name: "Brown Savana", hex: "#7a6855" },
  { name: "Dark Chocolate", hex: "#382f2d" },
  { name: "Russet", hex: "#512f2e" },
  { name: "Yellow Haze", hex: "#f5e1a4" },
  { name: "Cornsilk", hex: "#f0ec74" },
  { name: "Daisy", hex: "#fed101" },
  { name: "Gold", hex: "#eead1a" },
  { name: "Old Gold", hex: "#c39367" },
  { name: "Tangerine", hex: "#ff8a3d" },
  { name: "Safety Orange", hex: "#e5801c" },
  { name: "Orange", hex: "#f4633a" },
  { name: "Sunset", hex: "#dc6b2f" },
  { name: "Texas Orange", hex: "#bf5700", approx: true },
  { name: "Tennessee Orange", hex: "#b65a30" },
  { name: "Antique Orange", hex: "#b33d26" },
  { name: "Dusty Rose", hex: "#e1bbb4" },
  { name: "Coral Silk", hex: "#fb637e" },
  { name: "Light Pink", hex: "#e4c6d4" },
  { name: "Azalea", hex: "#dd74a1" },
  { name: "Safety Pink", hex: "#e16f8f" },
  { name: "Heliconia", hex: "#db3e79" },
  { name: "Heather Radiant Orchid", hex: "#a15a95" },
  { name: "Red", hex: "#d50032" },
  { name: "Heather Red", hex: "#bf0d3e" },
  { name: "Antique Cherry Red", hex: "#971b2f" },
  { name: "Cardinal", hex: "#8a1538" },
  { name: "Garnet", hex: "#7d2935" },
  { name: "Berry", hex: "#7f2952" },
  { name: "Maroon", hex: "#5b2b42" },
  { name: "Safety Green", hex: "#c6d219" },
  { name: "Neon Green", hex: "#93da49" },
  { name: "Lime", hex: "#92bf55" },
  { name: "Kiwi", hex: "#89a84f" },
  { name: "Electric Green", hex: "#43b02a" },
  { name: "Mint Green", hex: "#a0cfab" },
  { name: "Irish Green", hex: "#00a74a" },
  { name: "Antique Irish Green", hex: "#00843d" },
  { name: "Turf Green", hex: "#007a3e" },
  { name: "Fan Dark Green", hex: "#1d4d3a", approx: true },
  { name: "Heather Military Green", hex: "#7e7f74" },
  { name: "Military Green", hex: "#5e7461" },
  { name: "Forest Green", hex: "#273b33" },
  { name: "Jade Dome", hex: "#00857d" },
  { name: "Antique Jade Dome", hex: "#006269" },
  { name: "Fan Marine Green", hex: "#006a6b", approx: true },
  { name: "Aquatic", hex: "#0088a8", approx: true },
  { name: "Tropical Blue", hex: "#00859b" },
  { name: "Sky", hex: "#71c5e8" },
  { name: "Carolina Blue", hex: "#7ba4db" },
  { name: "Light Blue", hex: "#a4c8e1" },
  { name: "Heather Sapphire", hex: "#0076a8" },
  { name: "Sapphire", hex: "#0077b5" },
  { name: "Antique Sapphire", hex: "#006a8e" },
  { name: "Indigo Blue", hex: "#486d87" },
  { name: "Midnight", hex: "#005670" },
  { name: "Blue Dusk", hex: "#253746" },
  { name: "Iris", hex: "#3975b7" },
  { name: "Neon Blue", hex: "#0c51a3" },
  { name: "Royal", hex: "#224d8f" },
  { name: "Fan Deep Royal", hex: "#1f3a93", approx: true },
  { name: "Cobalt", hex: "#171c8f" },
  { name: "Heather Navy", hex: "#333f48" },
  { name: "Navy", hex: "#263147" },
  { name: "Violet", hex: "#8094dd" },
  { name: "Lilac", hex: "#563d82" },
  { name: "Purple", hex: "#464e7e" },
  { name: "Grape", hex: "#5a2a6e", approx: true },
  { name: "Fan Dark Purple", hex: "#3b2259", approx: true },
  { name: "Blackberry", hex: "#221c35" },
];

/** Gildan 18500 Heavy Blend hooded sweatshirt. */
export const GILDAN_18500: GarmentColor[] = [
  { name: "White", hex: "#ffffff" },
  { name: "Ash", hex: "#c8c9c7" },
  { name: "Sport Grey", hex: "#97999b" },
  { name: "Graphite Heather", hex: "#707372" },
  { name: "Charcoal", hex: "#66676c" },
  { name: "Fan Charcoal Heather", hex: "#5b5c60", approx: true },
  { name: "Dark Heather", hex: "#425563" },
  { name: "Black", hex: "#25282a" },
  { name: "Sand", hex: "#cabfad" },
  { name: "Dark Chocolate", hex: "#382f2d" },
  { name: "Gold", hex: "#eead1a" },
  { name: "Old Gold", hex: "#c39367" },
  { name: "Safety Orange", hex: "#e5801c" },
  { name: "Orange", hex: "#f4633a" },
  { name: "Light Pink", hex: "#e4c6d4" },
  { name: "Azalea", hex: "#dd74a1" },
  { name: "Safety Pink", hex: "#e16f8f" },
  { name: "Heliconia", hex: "#db3e79" },
  { name: "Red", hex: "#d50032" },
  { name: "Heather Scarlet Red", hex: "#b83a4b" },
  { name: "Cherry Red", hex: "#ac2b37" },
  { name: "Antique Cherry Red", hex: "#971b2f" },
  { name: "Cardinal Red", hex: "#8a1538" },
  { name: "Garnet", hex: "#7d2935" },
  { name: "Heather Dark Maroon", hex: "#651d32" },
  { name: "Maroon", hex: "#5b2b42" },
  { name: "Safety Green", hex: "#c6d219" },
  { name: "Mint Green", hex: "#a0cfab" },
  { name: "Irish Green", hex: "#00a74a" },
  { name: "Military Green", hex: "#5e7461" },
  { name: "Heather Dark Green", hex: "#3e5d58" },
  { name: "Fan Dark Green", hex: "#1d4d3a", approx: true },
  { name: "Forest", hex: "#273b33" },
  { name: "Carolina Blue", hex: "#7ba4db" },
  { name: "Light Blue", hex: "#a4c8e1" },
  { name: "Sapphire", hex: "#0077b5" },
  { name: "Antique Sapphire", hex: "#006a8e" },
  { name: "Indigo Blue", hex: "#486d87" },
  { name: "Neon Blue", hex: "#0c51a3" },
  { name: "Royal", hex: "#224d8f" },
  { name: "Heather Deep Royal", hex: "#1d4f91" },
  { name: "Fan Deep Royal", hex: "#1f3a93", approx: true },
  { name: "Heather Dark Navy", hex: "#595478" },
  { name: "Navy", hex: "#263147" },
  { name: "Orchid", hex: "#c5b4e3" },
  { name: "Violet", hex: "#8094dd" },
  { name: "Purple", hex: "#464e7e" },
];

/** [hue 0–360, saturation 0–1, lightness 0–1] for a #rrggbb color. */
export function hsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/**
 * Order for the color strip: neutrals first (light → dark), then the chromatic colors
 * around the hue wheel (red → orange → yellow → green → blue → purple), light → dark within a hue band.
 */
export function sortByHue(colors: GarmentColor[]): GarmentColor[] {
  const NEUTRAL_SAT = 0.12;
  const key = (c: GarmentColor) => {
    const [h, s, l] = hsl(c.hex);
    if (s < NEUTRAL_SAT || l < 0.12) return [0, 0, -l] as const;
    // Start the wheel at deep red/pink (330°) so reds sit together.
    const band = Math.floor(((h + 30) % 360) / 15);
    return [1, band, -l] as const;
  };
  return [...colors].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}

/** Gildan 5400 Heavy Cotton long sleeve tee (names from the 5400 color list; hex shared with 5000). */
export const GILDAN_5400: GarmentColor[] = [
  "White",
  "Ash",
  "Sport Grey",
  "Graphite Heather",
  "Charcoal",
  "Dark Heather",
  "Black",
  "Gold",
  "Safety Orange",
  "Orange",
  "Light Pink",
  "Red",
  "Cardinal",
  "Garnet",
  "Maroon",
  "Safety Green",
  "Irish Green",
  "Military Green",
  "Forest Green",
  "Light Blue",
  "Carolina Blue",
  "Indigo Blue",
  "Royal",
  "Navy",
  "Purple",
].map((name) => {
  const c = GILDAN_5000.find((x) => x.name === name);
  if (!c) throw new Error(`GILDAN_5400: no hex for ${name}`);
  return c;
});

/**
 * Gildan 42000 Performance tee (100% polyester). Names and Pantone codes from the 42000 spec
 * sheet; hex values are screen approximations of those Pantone codes. Codes shared with the
 * 5000 list reuse its hex so the same color looks the same across garments.
 */
export const GILDAN_42000: GarmentColor[] = [
  { name: "White", hex: "#ffffff" },
  { name: "Sport Grey", hex: "#97999b" }, // Cool Gray 7C
  { name: "Charcoal", hex: "#63666a" }, // Cool Gray 10C
  { name: "Black", hex: "#25282a" }, // 426C
  { name: "Prairie Dust", hex: "#7a7256" }, // 7497C
  { name: "Gold", hex: "#ffb81c" }, // 1235C
  { name: "Orange", hex: "#f68d76", approx: true }, // 2026C
  { name: "Safety Pink", hex: "#f4587a" }, // 1915C
  { name: "Plumrose", hex: "#c9809e", approx: true }, // 7431C
  { name: "Red", hex: "#d50032" }, // 199C
  { name: "Safety Green", hex: "#c4d600" }, // 382C
  { name: "Lime", hex: "#6cc24a" }, // 7488C
  { name: "Sage", hex: "#93a98b", approx: true }, // 2406C
  { name: "Military Green", hex: "#737b4c" }, // 5615C
  { name: "Carolina Blue", hex: "#7ba4db" }, // 659C
  { name: "Stone Blue", hex: "#8fa8c4", approx: true }, // 2164C
  { name: "Sapphire", hex: "#0067a0" }, // 641C
  { name: "Royal", hex: "#1d4f91" }, // 7686C
  { name: "Navy", hex: "#1f2a44" }, // 533C
];

/** Gildan 42400 Performance long sleeve (100% polyester): the 8 colors on its spec sheet. */
export const GILDAN_42400: GarmentColor[] = GILDAN_42000.filter((c) =>
  ["White", "Sport Grey", "Charcoal", "Black", "Red", "Safety Green", "Royal", "Navy"].includes(c.name),
);
