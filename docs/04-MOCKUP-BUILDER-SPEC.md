# Build-Your-Own Mockup Builder: Spec

> The flagship feature. Route: `/design`. Replaces the old "Design Your Own Shirt" page and must keep all of its controls (see `01-CURRENT-SITE-INVENTORY.md`).

## User story
*As a visitor, I pick a garment, choose its color(s), upload my design, place it, and get a realistic mockup emailed to me along with a 15% off my 2nd order coupon, so I can share it, think it over, or order it.*

## Flow

> **v2 (decided 2026-11-25, Logan):** customers need an **account (email + password, email verified by a 6-digit code)** before they can upload artwork or send anything. The builder ends in **two clearly separate paths**: **"Email me this mockup"** (mockup + coupon) and **"Order this design"** (an order request with sizes/quantities; the owner confirms the price and sends an invoice; no online payment yet). Garment colors come only from the **full Gildan color list for that style**, shown as a scrollable hue-sorted color strip; no free hex entry. Signed-in customers get **"My designs"** (saved mockups + order history). The builder must feel clean and sharp, with very clear, short instructions at every step. Sections below are updated where they changed.

```
1. Garment ─► 2. Colors ─► [sign up / log in + verify email, if needed] ─► 3. Design (upload + place) ─► 4. Choose: Email me this mockup | Order this design ─► 5. Done
```
Garment and color can be explored without an account; the sign-in step appears when the visitor first tries to upload artwork.
A single page with a stepper (mobile: bottom-sheet steps; desktop: canvas left, controls right). State persists in `sessionStorage` so a refresh doesn't lose work.

### 1. Choose garment
| Garment | Views | Print locations |
|---|---|---|
| **T-shirt** (Gildan 5000) | Front, Back | Front Chest, Left Chest, Full Front, Full Back |
| **Long sleeve tee** (Gildan 5400, added 2026-11-25) | Front, Back, Left sleeve, Right sleeve | Front Chest, Left Chest, Full Front, Full Back, Upper Sleeve, Full Sleeve |
| **Performance Tee** (Gildan 42000, 100% polyester, added 2026-11-26) | Front, Back | Front Chest, Left Chest, Full Front, Full Back |
| **Performance Long Sleeve** (Gildan 42400, 100% polyester, hemmed cuffs, added 2026-11-26) | Front, Back, Left sleeve, Right sleeve | Front Chest, Left Chest, Full Front, Full Back, Upper Sleeve, Full Sleeve |
| **Baseball tee (3/4 raglan)** (Bella+Canvas 3200) | Front, Back, Left sleeve, Right sleeve | Front Chest, Left Chest, Full Front, Full Back, Upper Sleeve, Full Sleeve |
| **Hoodie** (Gildan 18500) | Front, Back, Left sleeve, Right sleeve | Left Chest, Full Front (above pocket), Full Back, Upper Sleeve, Full Sleeve |
| **Hat** (Richardson 112) | Front | Hat Front |
| **Polo** | Front, Back | Left Chest, Full Back |
| **Tank** | Front, Back | Full Front, Full Back |

All six garments are required (confirmed 2026-11-23); the long sleeve tee was added 2026-11-25 (Logan). The two Performance shirts were added 2026-11-26 (Logan); no UV/UPF claim until the owner confirms (Brief Q13).

**Print method per side (2026-11-26):** under Print location, a "Print method" picker lists every method the shop runs (screen printing, DTF, DTG, embroidery, sublimation, heat-transfer vinyl) plus the default "Recommend one for me". Methods that don't fit are shown disabled with a one-line reason: DTG needs cotton or a cotton blend (no polyester, no hats); embroidery isn't offered on the thin Performance polyester or on areas over 12″ on a side; sublimation needs a Performance (polyester) shirt in a light color. A pick that stops fitting (color or print area changed) falls back to "recommend". On the wire: `views[].method` (default `"recommend"`), validated by the same rules on the server (`src/lib/print-methods.ts`). The method shows in the owner and customer emails. **Sleeve printing is offered on long-sleeve garments only** (long sleeve tee, hoodie, baseball tee), each sleeve as its own view.

**Artwork per side (2026-11-25):** an upload goes on the side being edited (front by default), never on every side. Each other side (back, left sleeve, right sleeve) can get the same file or a different one. On the wire every view carries an `artwork` index into the uploaded files `artwork-0…3` (≤ 30 MB total); the server stores each original once.

**Realistic colors (2026-11-25):** single-color blanks offer the style's real color list; the hoodie's hood lining and drawcords match the body (as on the 18500), so there's one hoodie color. Blanks that only come in fixed combos (baseball tee body/sleeves, trucker hat front/mesh/visor) offer **only those combos** (`src/lib/blank-combos.ts`), and the server rejects anything else. Default blanks are **Gildan**, which is always stocked. Add a "Have your own garment or a different brand in mind? Tell us in the notes; we'll print on it" line, because the shop prints on customer-supplied or requested garments.

Garment config lives in data (`src/lib/garments.ts` or the DB), not hard-coded in components:
```ts
type GarmentConfig = {
  id: 'tshirt' | 'raglan' | 'hoodie' | 'hat' | 'polo' | 'tank';
  name: string;
  colorZones: ColorZone[];          // tshirt/polo/tank: ['body']; raglan: ['body','sleeves']; hoodie: ['body','lining','drawstrings']; hat: ['front','mesh','brim']
  palette: GarmentColor[];          // stocked colors (name + hex); owner to confirm
  allowCustomHex: boolean;          // "custom color(s)" requirement; flag "subject to blank availability"
  views: { id: 'front'|'back'; width: number; height: number; zones: string[]; layers: { base: string; shading: string; highlight: string; mask: Record<zone,string> }; printAreas: PrintArea[] }[];
};
type PrintArea = { id: string; label: string; rect: { x:number; y:number; w:number; h:number }; maxInches: { w:number; h:number } };
```
Implemented in `src/lib/garments.ts` (with `highlightOpacity()`, `printedInches()`); print-area rects are in template px.

### 2. Choose color(s)
- **Multi-zone color** is what makes "custom color(s)" real: raglan body plus sleeves, hat front/mesh/brim, hoodie body plus hood lining.
- **Color strip (v2):** every Gildan blank color for the garment's style (`src/lib/gildan-colors.ts`: 5000 tee list, 18500 hoodie list; hats curated), sorted by hue, in a horizontally scrolling strip with the selected color's name always shown. Keyboard: arrow keys move through colors. No custom hex: the server rejects colors not in the garment's palette (`allowCustomHex: false`). Owner confirms styles/colors (Brief §6).
- Recolor technique: per zone, fill the mask with the chosen color → composite the **shading layer with `multiply`** (and an optional `screen` highlight layer) so folds and texture survive. Templates: see **Garment templates** below.
- **Garments stay neutral and realistic.** The site's neon theme never touches the garment, the canvas backdrop (plain light studio gray), or the exported mockup: the customer's colors and artwork are the only thing on show. Theme lives in the surrounding UI only.

### 3. Upload and place design
- Accept **PNG, JPG, SVG, WEBP** (≤ 20 MB, matching the current uploader; PDF/AI accepted later via `/upload`). Tip: "Transparent PNG works best."
- Client-side checks: type, size, dimensions; **low-resolution warning** if effective DPI at the chosen print size is < 150 (pixels ÷ print inches).
- Optional "Remove white background" helper (simple threshold or flood fill, client-side) **[nice-to-have]**.
- Canvas controls (parity plus more): drag, **size slider**, **rotate** (slider plus 15° snap), **center**, **remove**, flip, reset, undo/redo, **front/back toggle** (each view has its own artwork), keep artwork clipped to the selected print area with a dashed guide shown while editing.
- Print-location chips snap artwork into the preset area.
- Keyboard: arrows nudge (Shift = 10px), +/- scale, `R` rotate 15°, Delete removes.
- **Layers, text, stretch and skew (v4, 2026-11-25):** each side holds up to 8 layers (bottom → top), each an **image** (one of the uploaded files) or **text**. A layers panel reorders, duplicates and deletes them. Text: up to 60 characters, one of 8 print-safe fonts (`src/lib/text-fonts.ts`, self-hosted, free for commercial use), any ink color, optional outline (color + width), letter spacing (one line, scaled to fill its box, so there's no alignment control; the schema keeps `align`, default center). Every layer can be **stretched** (width and height independent; "lock ratio" on by default for images). **Text can arch** up (rainbow) or down (smile) with one "Arch" slider (`curve` −1…1, the line keeps its length along a half circle at most). **Skew was removed** (Logan, 2026-11-26): the wire format still accepts `skewX`/`skewY` (default 0) for older designs, but the builder no longer offers it. **Snap to center:** a dragged layer locks onto the print area's middle (horizontal and/or vertical) with a guide line. **Start over** (next to Back, with a confirm) clears the whole design and returns to garment selection. A text-only design needs no upload. On the wire: `views[].layers: ({type:"image", artwork, transform} | {type:"text", text, font, color, outline, align, letterSpacing, transform})[]`, `transform` gains `skewX`/`skewY` (unused since 2026-11-26); text layers carry `curve`; the old `{transform, artwork}` view is still accepted. Typed text goes to the owner email only, never to customer emails. **Sizing (2026-11-25 fix):** each view lists its largest print area first, and that is the default; new text starts at the font's natural shape at 80% of the area (down the length on tall areas like full sleeves); editing the words, font or spacing keeps the letters' proportions (the box follows the words); changing print location refits every layer, keeping its shape, rotation and skew. Anything past the print area stays visible but faded, with a "won't print" note and "Fit to area"; exports show only what prints. Max print sizes are an open owner question (Brief Q12).
- Show approximate printed size in inches as the user scales.
- **Simple panel (P48-2, 2026-11-26):** same features, calmer layout. The layers list only renders at 2+ layers (heading "Layers (n)"); at 0 the canvas empty state guides, at 1 the selected-item panel covers it. Text's ink is a row of 8 quick swatches (plain hex constants — black, white, red, royal blue, navy, kelly green, gold, hot pink — not a stock claim) plus a "Custom" swatch that unfolds the color picker + hex field. Every layer gets one action row — Center, Fit, Flip, Duplicate, Delete — and a read-only "Printed size: about W″ × H″" line. Outline, arch, spacing (text only) and size-in-inches/lock/rotate fold into native `<details>` disclosures that remember open/closed for the session. "Signed in as …" is a quiet line at the bottom of the panel.

### 4. Order details (order-request path only)
Sizes and quantities grid (XS–5XL / OSFA for hats) · "How did you hear about us?" (from the old Home survey). These live inside the **"Order this design"** card at step 4. Notes for Charly's moved above both path cards (P48-2, 2026-11-26): one optional field (`design.notes`, 2000 max) that rides along with either path.

### 5. Send step: two paths (v2 — replaces the email gate)
- **Sign-in comes earlier**: an account (email + password, verified by a 6-digit code) is required **before uploading artwork**; the gate dialog appears when a signed-out or unverified visitor tries to upload (button or drop) and links to `/signup` / `/login` / `/verify` with `next` back to the builder. The design persists in sessionStorage across the detour.
- **"Email me this mockup"** card: sends `intent: "email"`. Copy: "We'll email your mockup to {account email} plus 15% off your 2nd order." Marketing opt-in checkbox (unchecked by default). No email/name/phone/Turnstile on this route — the account is the identity; per-IP and per-user rate limits replace the anti-spam check.
- **"Order this design"** card: shows the sizes/quantities grid (notes live above both cards since P48-2); requires ≥ 1 total (client check matching the server). Sends `intent: "order"`. Copy: "Tell us sizes and quantities. We'll confirm the price and send you an invoice. Nothing is charged now."
- **The download buttons stay locked until a design is sent.** The preview stays visible. DECIDE on watermarks.
- On submit, the client renders **high-res PNGs per view** and uploads them with the **original artwork file** to `POST /api/mockups` (see `02-TECH-STACK-AND-ARCHITECTURE.md`).
- Server: `verifiedUser` first (401/403) → validate → rate-limit (per IP + per user) → store files → lead from the account → mockup row (`user_id`, `kind`) → coupon → emails.
- The old "Send to Charly's for a quote" endpoint (`/api/mockups/[id]/quote`) is removed; the order path replaces it.

### 6. Success screens (two, one per path)
- **Email path:** mockup images + **Download** buttons + coupon ticket (code, copy button, rules: "15% off your 2nd order · $30 minimum · expires {date, 1 year} · one per email") + CTAs: "Order this design" (returns to the order card, design intact), "Design another." Charly the dog celebrates.
- **Order path:** "Order request sent! We'll email you the price." + design summary + coupon ticket + "View in My designs" + "Design another".

**File retention (2026-11-26):** emailed-mockup files live under `mockups/` and are deleted after 30 days (R2 lifecycle rule `delete-mockups-30-days`; `src/lib/retention.ts`). The customer keeps the PNGs attached to the email; the owner email warns to download within 30 days; after that, a restore link brings back colors and text (images must be added again) and "My designs" shows "Images deleted after 30 days". Draft images live under `mockups/drafts/` under the same 30-day rule, reset on every save; order requests are stored under `orders/` and kept; the brand kit's logo lives under `brand/` and is kept.

### 6b. Saved drafts + the brand kit (P49-3, 2026-11-26)
- **Save draft** lives in the step-3 footer (Undo / Redo / Save draft / Start over). Signed-in members get a name dialog (60 max, prefilled "{Garment} draft"; the last name after that) — Save updates the loaded draft (its `id` rides in builder state + sessionStorage), "Save as new" starts a fresh one. The multipart `POST /api/account/drafts` sends `payload` = `{ id?, name, design }` (`design` = exactly `payloadPlan`'s output: dense artwork indexes, only sides with layers) + `artwork-0…n`. At 10 drafts the API's message shows with a link to the Drafts tab.
- **Open a draft** via `/?draft=<id>#design` — the same hydrate path as the `?mockup=` restore (fetch the signed artwork URLs to Files, decode, `designFromRestore`); expired images use the restore "expired" message (images added again; colors/text/sizes survive).
- **The brand kit** (`/account#brand`, ≤ 8 inks / ≤ 4 fonts / a logo ≤ 10 MB): the builder leads with it — "Your colors" swatches before the quick defaults, a "Your fonts" group first in the font select, and an "Add my logo" button in the Add row (fetched to a File through the normal upload path: same checks, counts toward the 4-file limit).

## Emails
**To customer** (React Email, neon on dark with light-mode fallback): subject "Your Charly's mockup is ready 🐾 + 15% off inside" · inline mockup image(s) plus attached PNGs · garment/color/location summary · coupon code with terms · CTA "Order this design" (deep link restoring the design via mockup id) · "Have a Ruffin awesome day."
**To owner:** subject "New mockup lead: {garment} · {email}" · all details, links to original artwork and mockups, quote-requested flag.

## Non-functional
- Mobile first: pinch-zoom and two-finger rotate on canvas; works at 360px wide.
- Canvas export must not be tainted: serve templates same-origin (`/public/garments`) or with CORS.
- Original artwork is preserved untouched for production. The mockup PNG is for preview only.
- Rate limit `/api/mockups`: 5 per hour per IP, 3 per day per email. Coupon issuance idempotent per email.
- Privacy: short privacy notice at the gate; artwork is used only to fulfil and quote; deletion on request.
- Analytics events: `builder_start`, `garment_selected`, `artwork_uploaded`, `gate_viewed`, `gate_submitted`, `quote_requested`, `mockup_downloaded`.

## Acceptance criteria
- [x] All 4 required garments with front/back (hat: front) and multi-zone recolor that looks realistic
- [x] Upload, drag, scale, rotate, center, remove, undo, front/back, print-location presets on mobile and desktop
- [x] Low-DPI warning appears correctly
- [x] Download is impossible before the email is submitted; after it, works per view
- [x] Customer email arrives with mockup(s) and a unique coupon; resubmitting with the same email re-sends the same code
- [x] Owner email arrives with original artwork link
- [x] Playwright e2e covers the happy path plus invalid email plus oversized file

(v2, shipped 2026-11-25 — prompt P45-2: all six garments; **account + verified email required before upload**, with the gate dialog and `next` back to the builder; **color strip** per zone (hue-sorted, keyboard arrows/Home/End, no hex entry); **two send paths** with separate success screens; **order requests** land in "My designs"; step headlines + "Step n of 4" progress; the quote endpoint is gone. Mobile QA at 360px:
no horizontal scroll, ≥ 44px primary targets (step pills ≥ 24px, WCAG 2.5.8) — `tests/e2e/builder.spec.ts`; full flow with accounts — `tests/e2e/builder-gate.spec.ts`.)

## Garment templates
**Decided 2026-11-25: original vector drawings (Option A)**, drawn in code, so we own them outright (no licensing). Source: `scripts/garments/shapes.mjs` (paths) + `render.mjs` (SVG layers) → `node scripts/garments/build.mjs` writes PNGs; `--preview` also writes test composites to `tmp/garment-previews/`; `--only=<garment>` rebuilds one. Commit the PNGs; `sharp` is a dev dependency used only by this script.

Per view, in `public/garments/{garment}/{view}/`:
| File | Use |
|---|---|
| `mask-<zone>.png` | Alpha mask per color zone; fill with the zone color (lossless PNG) |
| `shading.webp` | Folds, seams, stitching, plus a subtle knit texture; `multiply` over the fills. Its alpha is the garment silhouette (clip everything to it) |
| `highlight.webp` | Sheen; `screen` at `highlightOpacity(hex)` = 0.15 + 0.85 × (1 − luma), so dark fabric doesn't go flat |
| `base.webp` | White composite for thumbnails / loading |

The soft layers are lossy WebP (quality 82) because the knit texture compresses badly as PNG: all templates together are about 2 MB.

Size: 1000×1200 for tops and sleeve views, 1000×800 for the hat. Views: front + back (hat: front only), plus `left`/`right` sleeve views on the long sleeve tee, hoodie and baseball tee. Sleeves are drawn at about 0.4× body width (realistic flat-lay proportions; fixed 2026-11-25 after the first drawings came out too thin). Swap in owner photos later by keeping the same layer contract.
