import { colorName, findCombo, getGarment, type GarmentId } from "./garments";
import type { MockupColors, MockupLayer, MockupSizes, MockupView } from "./mockup-schema";
import { getTextFont } from "./text-fonts";

const deg = (skew: number) => Math.round((Math.atan(skew) * 180) / Math.PI);

/**
 * One line per layer (bottom → top) for the OWNER email only: text layers include the
 * visitor's typed text, which never goes into customer emails.
 */
export function describeLayers(layers: MockupLayer[]): string[] {
  return layers.map((layer, i) => {
    const t = layer.transform;
    const extras = [
      t.rotation ? `rotated ${Math.round(t.rotation)}°` : "",
      t.skewX || t.skewY ? `skewed ${deg(t.skewX)}°/${deg(t.skewY)}°` : "",
      t.flipX ? "mirrored" : "",
    ].filter(Boolean);
    const tail = extras.length ? `, ${extras.join(", ")}` : "";
    if (layer.type === "image") return `${i + 1}. Artwork file #${layer.artwork + 1}${tail}`;
    const font = getTextFont(layer.font)?.label ?? layer.font;
    const outline = layer.outline.width > 0 ? `, outline ${layer.outline.color} ${layer.outline.width}px` : "";
    return `${i + 1}. Text "${layer.text}" — ${font}, ${layer.color}${outline}${tail}`;
  });
}

/** Human-readable rows for mockup emails (customer + owner). Input must already be validated. */
export function mockupSummary(
  garmentId: GarmentId,
  colors: MockupColors,
  views: Pick<MockupView, "view" | "printArea">[],
  sizes: MockupSizes,
) {
  const garment = getGarment(garmentId);
  // Combo blanks are named once ("White / Navy"), not per zone.
  const combo = findCombo(garment, colors);
  const colorRows = combo
    ? [{ label: "Colors", hex: colors[garment.colorZones[0]!.id] ?? "", name: combo.name }]
    : garment.colorZones.map((zone) => {
        const hex = colors[zone.id] ?? "";
        return { label: zone.label, hex, name: colorName(garment, hex) };
      });
  const viewRows = views.map((entry) => {
    const view = garment.views.find((v) => v.id === entry.view)!;
    const area = view.printAreas.find((a) => a.id === entry.printArea) ?? view.printAreas[0]!;
    return { view: view.label, area: area.label };
  });
  const sizeRows = Object.entries(sizes)
    .filter(([, qty]) => qty > 0)
    .map(([size, qty]) => `${qty} × ${size}`);
  return { garment, colorRows, viewRows, sizeRows };
}
