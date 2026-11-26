// Build garment template layers for the mockup builder.
//   node scripts/garments/build.mjs            → public/garments/{garment}/{view}/*.png
//   node scripts/garments/build.mjs --preview  → also writes recolored previews to tmp/garment-previews/
// Layers per view: shading.webp (multiply), highlight.webp (screen), mask-<zone>.png, base.webp (white garment).
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { highlightSvg, maskSvgs, shadingSvg } from "./render.mjs";
import { garments } from "./shapes.mjs";

const OUT = "public/garments";
const preview = process.argv.includes("--preview");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

const WEBP = { quality: 82, alphaQuality: 90, effort: 5 };
const png = (svgString) => sharp(Buffer.from(svgString)).png({ compressionLevel: 9, palette: false });

/** Same rule the builder uses (src/lib/garments.ts highlightOpacity): darker colors get more highlight. */
export function highlightOpacity(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return +(0.15 + 0.85 * (1 - lum)).toFixed(3);
}

/** Recolor exactly the way the builder will: zone fills → multiply shading → screen highlight. */
export async function composite(dir, view, colors, hiOpacity = highlightOpacity(colors.body)) {
  const { width: W, height: H } = view;
  const layers = [];
  for (const zone of Object.keys(view.zones)) {
    const color = colors[zone] ?? colors.body;
    const mask = await sharp(join(dir, `mask-${zone}.png`))
      .extractChannel("alpha")
      .toBuffer();
    const fill = await sharp({ create: { width: W, height: H, channels: 3, background: color } })
      .joinChannel(mask)
      .png()
      .toBuffer();
    layers.push({ input: fill, blend: "over" });
  }
  const colored = await sharp({ create: { width: W, height: H, channels: 4, background: "#0000" } })
    .composite(layers)
    .png()
    .toBuffer();
  const hi = await sharp(join(dir, "highlight.webp"))
    .ensureAlpha(1)
    .linear([1, 1, 1, hiOpacity], [0, 0, 0, 0])
    .png()
    .toBuffer();
  const shaded = await sharp(colored)
    .composite([
      { input: join(dir, "shading.webp"), blend: "multiply" },
      { input: hi, blend: "screen" },
    ])
    .png()
    .toBuffer();
  // keep only the garment (silhouette + outline): cut with the shading layer's alpha
  return sharp(shaded)
    .ensureAlpha()
    .composite([{ input: join(dir, "shading.webp"), blend: "dest-in" }])
    .png()
    .toBuffer();
}

const PREVIEW_COLORS = [
  { body: "#ffffff" },
  { body: "#1b1b1f" },
  {
    body: "#1f3a6b",
    sleeves: "#ffffff",
    lining: "#9a9a9a",
    drawstrings: "#ffffff",
    front: "#ffffff",
    mesh: "#1f3a6b",
    brim: "#1f3a6b",
  },
  {
    body: "#c62828",
    sleeves: "#1b1b1f",
    lining: "#1b1b1f",
    drawstrings: "#1b1b1f",
    front: "#c62828",
    mesh: "#ffffff",
    brim: "#1b1b1f",
  },
  { body: "#9ea3a8" },
];

for (const [garment, views] of Object.entries(garments)) {
  if (only && only !== garment) continue;
  for (const [viewName, view] of Object.entries(views)) {
    const dir = join(OUT, garment, viewName);
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir))
      if (f.startsWith("mask-") && !(f.slice(5, -4) in view.zones)) rmSync(join(dir, f));
    // Shading carries the knit texture (noise compresses badly as PNG), so the soft layers are
    // lossy WebP (~10× smaller); masks stay lossless PNG so zone edges are exact.
    for (const stale of ["shading.png", "highlight.png", "base.png"]) rmSync(join(dir, stale), { force: true });
    await sharp(await png(shadingSvg(view)).toBuffer())
      .webp(WEBP)
      .toFile(join(dir, "shading.webp"));
    await sharp(await png(highlightSvg(view)).toBuffer())
      .webp(WEBP)
      .toFile(join(dir, "highlight.webp"));
    for (const [zone, s] of Object.entries(maskSvgs(view))) await png(s).toFile(join(dir, `mask-${zone}.png`));
    await sharp(await composite(dir, view, { body: "#ffffff" }))
      .webp(WEBP)
      .toFile(join(dir, "base.webp"));
    console.log(`${garment}/${viewName}: ${Object.keys(view.zones).join(", ")}`);

    if (preview) {
      const pdir = "tmp/garment-previews";
      mkdirSync(pdir, { recursive: true });
      const tiles = await Promise.all(
        PREVIEW_COLORS.map(async (c) =>
          sharp(await composite(dir, view, c))
            .resize({ width: 300 })
            .flatten({ background: { r: 233, g: 233, b: 236 } })
            .png()
            .toBuffer(),
        ),
      );
      const th = Math.round((300 * view.height) / view.width);
      await sharp({
        create: { width: 300 * tiles.length, height: th, channels: 3, background: { r: 233, g: 233, b: 236 } },
      })
        .composite(tiles.map((t, i) => ({ input: t, left: i * 300, top: 0 })))
        .png()
        .toFile(join(pdir, `${garment}-${viewName}.png`));
    }
  }
}
