# Tech Stack and Architecture

> Recommended defaults. Anything marked **DECIDE** needs Logan's sign-off before building on it. Record decisions in the Decision Log at the bottom.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | SSR/SSG for local SEO, API routes for forms and email, huge ecosystem, deploys anywhere |
| Styling | **Tailwind CSS** with design tokens from `03-DESIGN-SYSTEM.md` as CSS variables | Fast iteration; tokens keep the neon theme consistent |
| UI primitives | shadcn/ui (Radix) restyled neon | Accessible dialogs, selects, and tabs out of the box |
| Mockup canvas | **Konva (react-konva)** or **Fabric.js**. **DECIDE** (default: Konva) | Drag, scale, and rotate transforms, layer compositing, `toDataURL()` export |
| Garment recolor | Layered PNG/SVG templates: color layer tinted plus multiply-blended shading layer | Realistic color changes from a single photo template per view |
| Forms and validation | React Hook Form + Zod (shared schemas client and server) | One schema, both sides |
| Database | **Supabase (Postgres + Storage)**. **DECIDE** vs Neon + S3/R2 | Leads, coupons, uploads, quote requests; Storage for artwork and mockups |
| Email | **Resend** + React Email templates | Mockup delivery with coupon, owner notifications |
| Payments / catalog | **DECIDE: Square** (if they're already on Weebly/Square) **or Stripe Checkout** | Keep their existing merchant setup if possible |
| Anti-spam | Cloudflare Turnstile on every public form | Email gate and upload forms will attract bots |
| Hosting | **Vercel** (or Cloudflare Pages) | Preview deploys per PR |
| Analytics | Plausible or GA4 + Google Search Console | Funnel: builder start → gate → order |
| Testing | Vitest (unit) + Playwright (e2e: builder flow, forms) | The builder is the money path, so it needs e2e |
| Package manager | pnpm | |

## High-level architecture

```
Browser ──► Next.js pages (SSG: home, about, business, services, city pages)
       │
       ├─► /design (client-side Konva builder)
       │      └─ on "Email me my mockup":
       │           POST /api/mockups  { email, garment, colors, views[], printLocations, notes, turnstileToken }
       │              ├─ validate (Zod) + verify Turnstile + rate-limit by IP/email
       │              ├─ upload original artwork + rendered mockup PNGs → Storage
       │              ├─ upsert lead, create mockup row, issue coupon (idempotent per email)
       │              ├─ email customer: mockup image(s) + coupon code (Resend)
       │              └─ email owner: lead summary + links
       │
       ├─► /upload        POST /api/uploads   (existing-order artwork)
       ├─► /business      POST /api/quotes    (bulk / promo quotes)
       ├─► /about         POST /api/contact
       └─► /shop          Square or Stripe checkout ──webhook──► /api/webhooks/payments
                                                              └─ record order; mark coupon eligible / redeemed
```

## Data model (first pass)

```
leads        id, email (unique, citext), name, phone, referral_source, marketing_opt_in, created_at
mockups      id, lead_id, garment, colors jsonb, print_locations text[], views jsonb
             (per view: artwork_url, transform{x,y,scale,rotation}, mockup_url), sizes_qty jsonb, notes,
             status (new|contacted|quoted|ordered|closed), created_at
coupons      id, lead_id, code (unique), percent_off=15, type='second_order',
             status (issued|eligible|redeemed|expired), issued_at, expires_at, redeemed_order_id
orders       id, lead_id, provider (square|stripe), provider_order_id, total_cents, coupon_id, created_at
uploads      id, name, email, order_number, file_url, notes, created_at
quotes       id, company, name, email, phone, items jsonb, quantity, deadline, artwork_url, notes, status, created_at
contact_msgs id, name, email, message, created_at
```

### "15% off your 2nd order" logic
- Coupon issued at email-gate time: **one per email** (idempotent; resubmitting re-sends the same code).
- Code is unique and unguessable (e.g. `CHARLY-XXXX-XXXX`).
- **Valid only if that email has ≥ 1 completed prior order.** Enforce server-side at checkout. Not enforceable by a generic discount code alone, so we either (a) validate in our checkout flow before creating the payment session, or (b) create the provider-side discount only after the first-order webhook fires and email "your 15% is now unlocked." **DECIDE** (default: (b), which is cleaner and keeps the provider as source of truth).
- **Rules (confirmed 2026-11-23):** one coupon per email · expires **365 days** after issue · **$30.00 minimum order** (subtotal before tax and shipping) · 15% off. Scope (catalog, custom, or both) defaults to both until the owner says otherwise.
- All owner notifications go to one inbox: `OWNER_NOTIFY_EMAIL=CHARLYSCORNERSTORE@GMAIL.COM`.

## Repo layout (target)

```
/
├─ AGENTS.md            # rules for opencode + any agent (canonical)
├─ CLAUDE.md            # imports AGENTS.md for Claude Code
├─ README.md
├─ docs/                # these project docs (mirrored in the claude.ai project)
├─ ScrapedData/         # raw research (read-only reference)
├─ public/
│  └─ garments/         # template images per garment/view/layer
├─ src/
│  ├─ app/              # routes: (marketing)/, shop/, design/, upload/, business/, about/, api/
│  ├─ components/       # ui/ (primitives), neon/ (themed), builder/
│  ├─ lib/              # db, email, payments, coupons, validation (zod), turnstile
│  ├─ emails/           # React Email templates
│  └─ styles/           # tokens.css, globals.css
├─ supabase/            # migrations, seed
└─ tests/               # unit + e2e
```

## Environments and secrets
See `.env.example`. Never commit `.env*` (except the example). Secrets live in Vercel project settings.

## Decision log
| Date | Decision | Notes |
|---|---|---|
| 2026-11-23 | Next.js + TS + Tailwind, hosted on Vercel | Default, pending objection |
| 2026-11-23 | Private repo `violentwave/charlys-corner-store`; GitHub Actions CI (lint, typecheck, test, build) | Phase 0 |
| 2026-11-23 | Coupon: 1 per email, 365-day expiry, $30 min, 15% | Owner answer |
| 2026-11-23 | Builder ships 6 garments (adds Polo + Tank) | Owner answer |
| 2026-11-23 | Owner notifications go to one inbox: CHARLYSCORNERSTORE@GMAIL.COM | Owner answer |
| | Canvas lib | |
| | DB provider | |
| | Payments provider | |
| | Coupon enforcement approach | |
