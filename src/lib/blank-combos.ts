/**
 * Multi-color blanks that only come in fixed combinations (decided 2026-11-25: customers pick a
 * real combo, never mix-and-match). Each combo sets every color zone of the garment at once.
 * Hex values are screen approximations of the manufacturer swatches.
 *
 * TODO(content): owner confirms the raglan and hat styles he stocks and which combos (Brief §6).
 */
export type ColorCombo = {
  /** Manufacturer's name, e.g. "White / Navy". */
  name: string;
  /** zone id → hex for every color zone of the garment. */
  colors: Record<string, string>;
};

const C = {
  white: "#ffffff",
  black: "#1f1f21",
  navy: "#1e2a44",
  red: "#c8102e",
  royal: "#1f4fa3",
  kelly: "#00843d",
  maroon: "#5b1f2e",
  deepHeather: "#6e6f71",
  darkGrey: "#4a4b4f",
  asphalt: "#3f4447",
  denim: "#4a5d7e",
  heatherOlive: "#6b6b4c",
  heatherPeach: "#e9a88f",
  neonBlue: "#2aa6ff",
  neonOrange: "#ff6a1f",
  neonPink: "#ff4fa3",
  neonYellow: "#e6f53b",
  blackHeather: "#2e2f31",
  greyTri: "#a6a8ab",
  navyTri: "#34405a",
  redTri: "#a93a45",
  maroonTri: "#6a3340",
  royalTri: "#3d5fa3",
  emeraldTri: "#2c6e57",
  charcoalBlackTri: "#3b3c3e",
};

const raglan = (name: string, body: string, sleeves: string): ColorCombo => ({ name, colors: { body, sleeves } });

/** Bella+Canvas 3200 3/4-sleeve baseball tee: body / sleeves (the neck trim matches the sleeves). */
export const RAGLAN_COMBOS: ColorCombo[] = [
  raglan("White / Black", C.white, C.black),
  raglan("White / Navy", C.white, C.navy),
  raglan("White / Red", C.white, C.red),
  raglan("White / True Royal", C.white, C.royal),
  raglan("White / Kelly", C.white, C.kelly),
  raglan("White / Maroon", C.white, C.maroon),
  raglan("White / Deep Heather", C.white, C.deepHeather),
  raglan("White / Dark Grey", C.white, C.darkGrey),
  raglan("White / Asphalt", C.white, C.asphalt),
  raglan("White / Denim", C.white, C.denim),
  raglan("White / Heather Olive", C.white, C.heatherOlive),
  raglan("White / Heather Peach", C.white, C.heatherPeach),
  raglan("White / Neon Blue", C.white, C.neonBlue),
  raglan("White / Neon Orange", C.white, C.neonOrange),
  raglan("White / Neon Pink", C.white, C.neonPink),
  raglan("White / Neon Yellow", C.white, C.neonYellow),
  raglan("Black / White", C.black, C.white),
  raglan("Black / Red", C.black, C.red),
  raglan("Black / True Royal", C.black, C.royal),
  raglan("Black / Deep Heather", C.black, C.deepHeather),
  raglan("Deep Heather / Black", C.deepHeather, C.black),
  raglan("Black Heather / Black", C.blackHeather, C.black),
  raglan("Grey / Navy Triblend", C.greyTri, C.navyTri),
  raglan("Grey / Red Triblend", C.greyTri, C.redTri),
  raglan("Grey / Maroon Triblend", C.greyTri, C.maroonTri),
  raglan("Grey / True Royal Triblend", C.greyTri, C.royalTri),
  raglan("Grey / Emerald Triblend", C.greyTri, C.emeraldTri),
  raglan("Grey / Charcoal-Black Triblend", C.greyTri, C.charcoalBlackTri),
];

const H = {
  black: "#1c1c1e",
  white: "#f4f4f4",
  navy: "#1f2a44",
  charcoal: "#4a4c50",
  heatherGrey: "#9a9b9d",
  kelly: "#1f7a46",
  maroon: "#5b1f2e",
  orange: "#e35b1d",
  columbiaBlue: "#8fb4d9",
  lightGrey: "#b9bbbe",
  loden: "#4b5240",
  coffee: "#5a4535",
  cream: "#efe6cf",
  khaki: "#c8b48a",
  red: "#c62828",
  royal: "#2453a6",
  darkGreen: "#1f4a32",
  cardinal: "#8a1538",
  hotPink: "#e0458a",
  purple: "#4b2e83",
  neonOrange: "#ff6a1f",
  birch: "#d8cfbe",
  amberGold: "#e0a43a",
};

/** Solid hat: front, mesh and visor all one color. */
const solid = (name: string, hex: string): ColorCombo => ({ name, colors: { front: hex, mesh: hex, brim: hex } });
/** Richardson two-tone naming: "Front & visor / mesh". */
const split = (name: string, front: string, mesh: string): ColorCombo => ({
  name,
  colors: { front, mesh, brim: front },
});
/** Richardson tri-tone naming: "Front / mesh / visor". */
const tri = (name: string, front: string, mesh: string, brim: string): ColorCombo => ({
  name,
  colors: { front, mesh, brim },
});

/** Richardson 112 trucker. */
export const HAT_COMBOS: ColorCombo[] = [
  solid("Black", H.black),
  solid("White", H.white),
  solid("Navy", H.navy),
  solid("Charcoal", H.charcoal),
  solid("Light Grey", H.lightGrey),
  solid("Kelly Green", H.kelly),
  solid("Maroon", H.maroon),
  solid("Orange", H.orange),
  solid("Columbia Blue", H.columbiaBlue),
  solid("Loden", H.loden),
  solid("Coffee", H.coffee),
  solid("Cream", H.cream),
  split("Black / White", H.black, H.white),
  split("White / Black", H.white, H.black),
  split("White / Navy", H.white, H.navy),
  split("Charcoal / Black", H.charcoal, H.black),
  split("Charcoal / White", H.charcoal, H.white),
  split("Charcoal / Red", H.charcoal, H.red),
  split("Charcoal / Royal", H.charcoal, H.royal),
  split("Charcoal / Neon Orange", H.charcoal, H.neonOrange),
  split("Heather Grey / Black", H.heatherGrey, H.black),
  split("Heather Grey / White", H.heatherGrey, H.white),
  split("Heather Grey / Navy", H.heatherGrey, H.navy),
  split("Heather Grey / Royal", H.heatherGrey, H.royal),
  split("Heather Grey / Dark Green", H.heatherGrey, H.darkGreen),
  split("Navy / Khaki", H.navy, H.khaki),
  split("Navy / Charcoal", H.navy, H.charcoal),
  split("Red / White", H.red, H.white),
  split("Red / Black", H.red, H.black),
  split("Royal / White", H.royal, H.white),
  split("Royal / Black", H.royal, H.black),
  split("Kelly / White", H.kelly, H.white),
  split("Maroon / White", H.maroon, H.white),
  split("Cardinal / White", H.cardinal, H.white),
  split("Orange / Black", H.orange, H.black),
  split("Orange / White", H.orange, H.white),
  split("Columbia Blue / White", H.columbiaBlue, H.white),
  split("Dark Green / White", H.darkGreen, H.white),
  split("Hot Pink / White", H.hotPink, H.white),
  split("Purple / White", H.purple, H.white),
  split("Khaki / Coffee", H.khaki, H.coffee),
  split("Khaki / White", H.khaki, H.white),
  tri("Black / White / Red", H.black, H.white, H.red),
  tri("Navy / White / Red", H.navy, H.white, H.red),
  tri("Red / White / Navy", H.red, H.white, H.navy),
  tri("Royal / White / Red", H.royal, H.white, H.red),
  tri("Heather Grey / Birch / Amber Gold", H.heatherGrey, H.birch, H.amberGold),
];
