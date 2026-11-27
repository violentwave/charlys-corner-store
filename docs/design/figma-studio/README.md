# Figma Make studio redesign: reference only

Logan's Figma Make redesign of the mockup builder (2026-11-26), kept as a **visual reference** for
restyling our builder and the cart. Nothing here is imported, built or served.

## Take from it

- The shell around the canvas: sticky header with the Charly badge, the sunset/palm/grid hero with the
  chrome "Build-Your-Own Mockup" title, the glowing numbered stepper with the gradient progress bar,
  the dark rounded panels, the garment cards (thumbnail, name, one-liner, "Performance polyester" tag,
  cyan selected ring + check), the tool tabs (Item / Add / Side / Layers), the dashed upload zone, the
  three send-path cards with icons, the cart page, the canvas toolbar (zoom − 1× + Fit, Front/Back
  pill, undo/redo), the panel's fixed bottom bar (Back · Save draft · Continue · More), the footer strip.
- Spacing, radii, borders, glow use and type scale (Orbitron headings, Poppins UI, JetBrains Mono for
  labels and numbers).

## Do NOT take from it (Logan, 2026-11-26)

- **Its garment photos and its canvas.** We keep our own garment templates (`public/garments/`, drawn by
  `scripts/garments/`), our Konva stage, zone masks, sleeve views and print areas.
- **Its color lists.** We keep every Gildan / blank color in `src/lib/gildan-colors.ts` and the real
  combos in `src/lib/blank-combos.ts`.
- Its backend (Payload, `studio-api`), its fonts files (we self-host via `@fontsource`), its state model.
- Its contrast bugs: several headings render dark-on-dark (the "CHARLY'S" wordmark, "LIVE PREVIEW",
  panel titles, card names). Ours must pass WCAG 2.2 AA.

## Files

- `screens/`: screenshots at 1440 × 900 and 390 × 844 (steps 1, 3, 4, cart, component sheet). The error
  banner in them is only the prototype's missing mock backend.
- `source/*.txt`: the prototype's UI code (`studio-ui`, `studio-controls`, `studio`, `sheet`,
  `styles.css`), renamed `.txt` so lint/typecheck/build ignore it. Read it for class names, sizes and
  structure; re-express everything with our tokens (`src/styles/tokens.css`) and components.
