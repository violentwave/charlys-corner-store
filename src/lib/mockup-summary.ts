import { colorName, findCombo, getGarment, type GarmentId } from "./garments";
import type { MockupColors, MockupSizes, MockupView } from "./mockup-schema";

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
