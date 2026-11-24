# Roadmap

> Phased plan. Each phase ends deployable. Check items off as PRs merge. One PR ≈ one checkbox where possible.

## Phase 0: Setup (day 1)

- [x] Create **private** GitHub repo `violentwave/charlys-corner-store`; push starter files, `ScrapedData/`, `Assets/`
- [x] Scaffold Next.js 16.4 (App Router, TS strict, Tailwind v4, ESLint, pnpm), Prettier, Vitest, Playwright, design tokens, self-hosted fonts, placeholder home with logo
- [x] GitHub Actions CI: lint, typecheck, unit tests, build, then e2e
- [x] `opencode.json` + `AGENTS.md` so opencode loads the project rules
- [x] Local folder linked to the repo; opencode running
- [ ] Global git identity + pnpm on Logan's machine (see `07-WORKFLOW.md` → Local setup)
- [ ] Hosting decided: **Render** (see `02` → Hosting and portability). Re-check Render pricing and Hobby workspace terms, then open the account **in the owner's name** (his email and card)
- [ ] `render.yaml` blueprint (Node web service + Postgres) and a Render service linked to the repo, auto-deploy from `main`; PR preview deploys if the plan includes them
- [ ] Branch protection on `main` (require CI to pass)
- [ ] Send the owner the remaining open questions (Brief §6)
- [ ] Download all current-site images and copy (migration backup)
- [ ] Fix the logo typo ("Apperal" → "Apparel") and get a vector version

## Phase 1: Design foundation

- [x] `src/styles/tokens.css` from `03-DESIGN-SYSTEM.md`; Tailwind theme mapped to tokens (Phase 0)
- [x] Fonts self-hosted via `@fontsource` (Phase 0)
- [ ] Layout: sticky neon nav (mobile drawer), footer (NAP, socials, nav, "Have a Ruffin awesome day"). **Built on `feat/layout-shell`; PR open, merge after review**
- [ ] Primitives: Button (primary/secondary/ghost), Card, Input, Select, Tabs, Dialog, Toast, Badge, CouponTicket
- [ ] `/styleguide` dev-only page showing every component
- [ ] Hero component: horizon gradient, perspective grid, sun, palms (reduced-motion safe)

## Phase 2: Parity pages (static content first)

- [ ] Home: hero, services grid, featured products, builder CTA, how-it-works, use cases, testimonials placeholder, referral survey
- [ ] About: Charly story, photos, contact form
- [ ] Business & Promo: copy, gallery (past-work photos), quote form; cards, flyers, stickers, lanyards, pillows, koozies, banners
- [ ] Services: screen print / DTF / embroidery / sublimation explainer
- [ ] FAQ
- [ ] Contact: NAP, map, hours, form
- [ ] 404 page with Charly

## Phase 3: Forms and backend

- [ ] Postgres on Render; Drizzle schema and SQL migrations in `db/` for the tables in `02-TECH…`
- [ ] **DECIDE file storage** (Cloudflare R2 vs Render disk), then `src/lib/storage.ts` (S3-compatible interface)
- [ ] Zod schemas shared client/server; Turnstile; rate limiting
- [ ] `/upload` (existing-order artwork), `/api/uploads`
- [ ] `/api/contact`, `/api/quotes`
- [ ] Resend + React Email: owner notification template, customer confirmation template

## Phase 4: Mockup builder (flagship)

- [ ] Garment templates (asset decision) for T-shirt, Raglan, Hoodie, Hat, Polo, Tank
- [ ] Garment config data + recolor compositor (mask + multiply shading), unit-tested
- [ ] Canvas: upload, transform, print areas, front/back, presets, undo/redo, keyboard
- [ ] DPI warning; sizes/qty; notes
- [ ] Email gate + `/api/mockups` + coupon issuance + customer and owner emails
- [ ] Success screen, download, "request quote," restore-design deep link
- [ ] Playwright e2e for the full flow; mobile QA

## Phase 5: Shop and checkout

- [ ] Payments provider decision (Square vs Stripe) and catalog import of the 9 current products + variants
- [ ] `/shop` grid (hover image swap), product pages, cart, checkout
- [ ] Memorial/fundraiser collection with donation note
- [ ] Order webhook → `orders` table → unlock 2nd-order coupon → "your 15% is unlocked" email
- [ ] Coupon redemption and enforcement (rules already in `src/lib/coupons.ts`)

## Phase 6: SEO, analytics, launch

- [ ] Metadata, OG images, sitemap, robots, JSON-LD (LocalBusiness, Product, FAQ, Breadcrumb)
- [ ] City/service landing pages (Brief §2.4)
- [ ] Analytics + builder funnel events; Search Console
- [ ] Accessibility audit (axe + manual keyboard pass); Lighthouse targets
- [ ] Backups: confirm Render Postgres backup/retention on our plan; add a scheduled `pg_dump` to the bucket if it isn't enough
- [ ] Owner walkthrough and content sign-off
- [ ] DNS cutover from Weebly: owner adds Render's DNS records at his registrar (lower TTL a day before); 301 redirects for old `.html` URLs; verify forms in production

## v2 backlog

"Ask Charly" AI chat · team/fundraiser online stores · reviews integration · sticker/DTF gang-sheet builder · admin dashboard for leads/mockups · Konami easter egg 🌴
