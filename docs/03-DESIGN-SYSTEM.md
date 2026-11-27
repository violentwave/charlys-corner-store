# Design System: "Neon Coast"

> Miami Vice × synthwave × light cyberpunk, for a Treasure Coast print shop with a dog mascot.
> Distilled from `ScrapedData/charly-corner-store/design-inspiration/neon-dark-mode-theme.css`, `dark-mode-palettes-extraction.json`, and `ScrapedData/research/dark-mode-ui-patterns.md`.

## Mood
Night drive down US-1. Hot-pink and cyan neon on deep indigo-black. Sunset gradients, chrome headlines, a subtle perspective grid, palm silhouettes. **Fun and confident, never cluttered.** Charly the dog adds warmth and humor so it doesn't read as cold tech.

Guardrails:
- Neon is **accent, not wallpaper**: ~80% dark surfaces, ~15% text, ~5% glow.
- Customer artwork and garment previews are the hero. The builder canvas sits on a neutral surface so colors judge true.
- Every glow effect must also pass contrast without the glow.

## Color tokens

```css
:root {
  /* Surfaces: indigo-tinted blacks (more "Miami night" than pure #000) */
  --bg-0: #0A0A14;      /* page */
  --bg-1: #12121F;      /* sections */
  --bg-2: #1A1A2E;      /* cards */
  --bg-3: #24243D;      /* elevated / inputs */
  --border: #2E2E4A;
  --border-strong: #3E3E5E;

  /* Text */
  --text-1: #F5F3FF;    /* primary */
  --text-2: #B8B5D6;    /* secondary */
  --text-3: #7C7A9C;    /* muted (large text only) */

  /* Neon accents */
  --neon-pink:   #FF2E97; /* primary CTA, brand */
  --neon-cyan:   #00F0FF; /* links, focus, secondary */
  --neon-purple: #B026FF;
  --neon-orange: #FF6B35; /* sunset */
  --neon-yellow: #FFE14D; /* prices, badges */
  --neon-green:  #39FF88; /* success */
  --danger:      #FF3366;

  /* Gradients */
  --grad-sunset:  linear-gradient(135deg, #FF2E97 0%, #FF6B35 55%, #FFE14D 100%);
  --grad-vice:    linear-gradient(90deg, #FF2E97 0%, #00F0FF 100%);
  --grad-horizon: linear-gradient(180deg, #0A0A14 0%, #1A0A2E 55%, #FF2E97 140%);
  --grad-chrome:  linear-gradient(180deg, #FFFFFF 0%, #C9C9E0 45%, #6E6E8F 50%, #E6E6F5 100%);

  /* Glows */
  --glow-pink: 0 0 8px rgb(255 46 151 / .55), 0 0 24px rgb(255 46 151 / .35);
  --glow-cyan: 0 0 8px rgb(0 240 255 / .55), 0 0 24px rgb(0 240 255 / .30);
}
```
Pairing rules: **pink = act** (primary buttons, "Get my mockup"), **cyan = navigate/focus** (links, focus rings, active tabs), **yellow = money** (prices, coupon), **green = success**. Dark text (`--bg-0`) on neon-filled buttons, never white on cyan or yellow.

## Typography
| Role | Font (Google Fonts) | Notes |
|---|---|---|
| Display / logo-ish headings | **Monoton** or **Bungee Inline** (pick one, **DECIDE**) | Neon-tube look; H1 and hero only, never body |
| Headings | **Orbitron** or **Exo 2** | Uppercase, letter-spacing .04em |
| Body / UI | **Poppins** 300–600 (the research pick) or Inter | 16px base, 1.6 line-height |
| Script accent | **Mr Dafoe** or **Yellowtail** | "Miami" signature flourishes, sparingly |
| Mono (prices, codes, coupon) | **JetBrains Mono** | |

Scale (rem): 0.75 · 0.875 · 1 · 1.125 · 1.25 · 1.5 · 2 · 2.5 · 3.5 · 5 (hero).

## Spacing, radius, motion
- Spacing: 4px base (Tailwind default scale). Sections `py-20 md:py-32`.
- Radius: 6 / 10 / 16 / full (pill CTAs).
- Motion: 150ms micro, 300ms standard, 500ms page. **Respect `prefers-reduced-motion`**: disable flicker, scanlines, and parallax grid animation.

## Signature components
- **Neon button:** pill, `--neon-pink` fill, dark text, `--glow-pink` on hover, `translateY(-2px)`. Secondary: cyan 1px outline, glow on hover.
- **Glass card:** `--bg-2` at 85% + `backdrop-blur(10px)`, 1px `--border`, pink+cyan glow on hover.
- **Sticky nav:** `rgb(10 10 20 / .8)` + blur, 1px gradient bottom border (`--grad-vice`), active link underlined in cyan glow.
- **Hero:** horizon gradient, animated perspective grid floor (CSS, low opacity), sun disk with scanline stripes, chrome or neon headline, palm silhouettes.
- **Neon sign text:** `text-shadow` glow plus optional one-time flicker on load (reduced-motion safe).
- **Coupon ticket:** dashed yellow border, mono code, "copy" button.
- **Charly mascot:** simple line-art neon dog (commission or illustrate; ask the owner for photos) for empty states, 404, loading ("Fetching your mockup…"), and success screens.

## Motion (P52-3)

Tokens (in `src/styles/tokens.css`): `--motion-fast: 120ms`, `--motion-base: 200ms`, `--ease-out-neon: cubic-bezier(0.22, 1, 0.36, 1)`. Nothing runs longer than 250 ms; use the tokens, never a hard-coded duration.

Where transitions are used:
- **Page navigation** — every `page.tsx` wraps its content in `<PageTransition>` (`src/components/layout/page-transition.tsx`), a React `<ViewTransition>`: the old page fades out in 120 ms with a 6px upward slide, the new one fades in over 200 ms from 8px below. It lives in each page, not the layout (layouts persist, so their enter/exit never fire). Links carry `transitionTypes={["nav-forward"]}`; browser back adds `nav-back` on `popstate`, which plays the reverse slide.
- **Anchored chrome** — header, footer and menu drawer carry their own `view-transition-name` (`site-header`, `site-footer`, `site-menu`) and never animate, so the page moves and the frame stays put.
- **Account tabs, builder steps, mobile tool tabs** — a keyed `<ViewTransition>` around the panel crossfades with a 4px slide in the direction of travel (tab to the right enters from the right), changed inside `startTransition`. The Konva stage sits outside the wrapper: the canvas never animates or remounts.
- **Menu drawer** — its slide plus a 150 ms stagger-in of the first 8 link rows (`#site-menu[data-open] [data-menu-row]`, CSS only).
- **Home section jumps** — a one-shot 400 ms cyan underline sweep on the reached heading (`section:target [data-section-heading]`). The underline is always present but transparent, so the sweep costs no layout.
- **Hover/press polish** — 120 ms transform/opacity (and colours) only; no box-shadow animation on large elements.

Reduced-motion rule: every animation and keyframe is defined inside `@media (prefers-reduced-motion: no-preference)`, so with `reduce` nothing is defined and content swaps instantly; the global `@media (prefers-reduced-motion: reduce)` block additionally forces `animation-duration: 0.01ms` / `transition-duration: 0.01ms` and zero-duration view transitions. Browsers without the View Transitions API just swap instantly (no polyfill). CLS stays 0: transitions only use `transform`/`opacity`, never layout properties.

## Accessibility (non-negotiable)
- WCAG 2.2 AA: body text ≥ 4.5:1, large text ≥ 3:1. `--text-3` is for ≥18px only.
- Visible focus ring: 2px `--neon-cyan` + offset on every interactive element.
- Never convey state by color alone (garment color swatches carry names and aria-labels).
- All builder actions keyboard-operable (arrow keys nudge, +/- scale, R rotate).

## Inspiration references (from research)
- Rapid Silk Screen: Bungee Inline + Nunito pairing (retro display, friendly body)
- Muzli dark-mode set: glass cards, sticky blur nav, gradient pill CTAs
- Awwwards/Colorlib retro galleries (Poolsuite is a good tone reference: playful retro done with restraint)
