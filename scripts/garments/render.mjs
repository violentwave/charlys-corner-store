// Turns a garment view definition (see shapes.mjs) into the layer SVGs the builder composites:
//   shading   – grayscale, MULTIPLIED over the chosen color(s): folds, seams, edge falloff, outline
//   highlight – white soft ridges, SCREENED at low opacity so dark colors keep their folds
//   mask-<z>  – opaque white where zone <z> is, transparent elsewhere (zones partition the silhouette)
// Garments are deliberately neutral and realistic: no theme colors, gradients, or glow.

const BLURS = { fold: 9, crease: 2, inner: 3, tone: 22, ridge: 12, edge: 26 };

function svg(width, height, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${defs}
${Object.entries(BLURS)
  .map(
    ([k, s]) =>
      `<filter id="b-${k}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${s}"/></filter>`,
  )
  .join("\n")}
<pattern id="rib-v" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="2.2" height="7" fill="#000"/></pattern>
<pattern id="rib-h" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="2.2" fill="#000"/></pattern>
<pattern id="mesh" width="14" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 L3.5 0 H10.5 L14 6 L10.5 12 H3.5 Z" fill="none" stroke="#000" stroke-width="2.2"/></pattern>
<pattern id="twill" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1.4" height="9" fill="#000"/></pattern>
</defs>
${body}
</svg>`;
}

function shadeElement(el) {
  const o = el.o;
  switch (el.kind) {
    case "fold":
      return `<path d="${el.d}" fill="none" stroke="#000" stroke-opacity="${o ?? 0.13}" stroke-width="${el.w ?? 16}" stroke-linecap="round" filter="url(#b-fold)"/>`;
    case "crease":
      return `<path d="${el.d}" fill="none" stroke="#000" stroke-opacity="${o ?? 0.2}" stroke-width="${el.w ?? 4}" stroke-linecap="round" filter="url(#b-crease)"/>`;
    case "inner":
      return `<path d="${el.d}" fill="#000" fill-opacity="${o ?? 0.42}" filter="url(#b-inner)"/>`;
    case "tone":
      return `<path d="${el.d}" fill="#000" fill-opacity="${o ?? 0.12}" filter="url(#b-tone)"/>`;
    case "seam":
      return `<path d="${el.d}" fill="none" stroke="#000" stroke-opacity="${o ?? 0.3}" stroke-width="${el.w ?? 2.4}" stroke-linecap="round"/>`;
    case "stitch":
      return `<path d="${el.d}" fill="none" stroke="#000" stroke-opacity="${o ?? 0.32}" stroke-width="${el.w ?? 1.6}" stroke-dasharray="7 5" stroke-linecap="round"/>`;
    case "rib":
      return `<path d="${el.d}" fill="url(#${el.dir === "h" ? "rib-h" : "rib-v"})" fill-opacity="${o ?? 0.1}"/>`;
    case "mesh":
      return `<path d="${el.d}" fill="url(#mesh)" fill-opacity="${o ?? 0.38}"/>`;
    case "twill":
      return `<path d="${el.d}" fill="url(#twill)" fill-opacity="${o ?? 0.06}"/>`;
    case "button":
      return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" fill="#000" fill-opacity="0.18" stroke="#000" stroke-opacity="0.4" stroke-width="1.5"/>
<circle cx="${el.cx - el.r * 0.3}" cy="${el.cy}" r="${el.r * 0.16}" fill="#000" fill-opacity="0.5"/><circle cx="${el.cx + el.r * 0.3}" cy="${el.cy}" r="${el.r * 0.16}" fill="#000" fill-opacity="0.5"/>`;
    case "grommet":
      return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" fill="#000" fill-opacity="0.55"/><circle cx="${el.cx}" cy="${el.cy}" r="${el.r * 1.6}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="${el.r * 0.7}"/>`;
    case "edge": // soft inner falloff along an arbitrary edge (e.g. under a collar)
      return `<path d="${el.d}" fill="none" stroke="#000" stroke-opacity="${o ?? 0.16}" stroke-width="${el.w ?? 40}" filter="url(#b-edge)"/>`;
    default:
      throw new Error(`unknown shade kind ${el.kind}`);
  }
}

export function shadingSvg(view) {
  const { width: W, height: H, silhouette, shade = [] } = view;
  const defs = `<clipPath id="sil"><path d="${silhouette}"/></clipPath>`;
  const body = `<g clip-path="url(#sil)">
<rect width="${W}" height="${H}" fill="#fff"/>
<path d="${silhouette}" fill="none" stroke="#000" stroke-opacity="${view.edgeOpacity ?? 0.17}" stroke-width="${view.edgeWidth ?? 70}" filter="url(#b-edge)"/>
${shade.map(shadeElement).join("\n")}
</g>
<path d="${silhouette}" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="2.6" stroke-linejoin="round"/>`;
  return svg(W, H, defs, body);
}

export function highlightSvg(view) {
  const { width: W, height: H, silhouette, highlight = [] } = view;
  const defs = `<clipPath id="sil"><path d="${silhouette}"/></clipPath>`;
  const body = `<g clip-path="url(#sil)">
${highlight
  .map(
    (h) =>
      `<path d="${h.d}" fill="none" stroke="#fff" stroke-opacity="${h.o ?? 0.6}" stroke-width="${h.w ?? 18}" stroke-linecap="round" filter="url(#${h.sharp ? "b-crease" : "b-ridge"})"/>`,
  )
  .join("\n")}
</g>`;
  return svg(W, H, defs, body);
}

/** Zones partition the silhouette: the first zone ("body") is the silhouette minus every other zone. */
export function maskSvgs(view) {
  const { width: W, height: H, silhouette, zones } = view;
  const names = Object.keys(zones);
  const out = {};
  for (const name of names) {
    const others = names.filter((n) => n !== name && zones[n] !== null);
    if (zones[name] === null) {
      // the base zone: silhouette minus all other zones
      const defs = `<mask id="m"><rect width="${W}" height="${H}" fill="#fff"/>${others
        .map((n) => `<path d="${zones[n]}" fill="#000"/>`)
        .join("")}</mask>`;
      out[name] = svg(W, H, defs, `<path d="${silhouette}" fill="#fff" mask="url(#m)"/>`);
    } else {
      const defs = `<clipPath id="sil"><path d="${silhouette}"/></clipPath>`;
      out[name] = svg(W, H, defs, `<path d="${zones[name]}" fill="#fff" clip-path="url(#sil)"/>`);
    }
  }
  return out;
}
