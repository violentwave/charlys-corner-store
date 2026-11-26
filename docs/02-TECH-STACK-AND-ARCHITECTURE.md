# Tech Stack and Architecture

> Recommended defaults. Anything marked **DECIDE** needs Logan's sign-off before building on it. Record decisions in the Decision Log at the bottom.

## Stack

| Layer                | Choice                                                                                                                                                                                         | Why                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Framework            | **Next.js 16.4 (App Router) + TypeScript (strict)**                                                                                                                                            | SSR/SSG for local SEO, API routes for forms and email, huge ecosystem, deploys anywhere                               |
| Styling              | **Tailwind CSS v4** with design tokens from `03-DESIGN-SYSTEM.md` as CSS variables (`src/styles/tokens.css`)                                                                                   | Fast iteration; tokens keep the neon theme consistent                                                                 |
| Fonts                | Self-hosted via `@fontsource` (Poppins, Orbitron, JetBrains Mono)                                                                                                                              | No build-time network calls; no Google Fonts dependency                                                               |
| UI primitives        | shadcn/ui (Radix) restyled neon                                                                                                                                                                | Accessible dialogs, selects, and tabs out of the box                                                                  |
| Mockup canvas        | **Konva + react-konva** (both MIT, free). Decided 2026-11-25. Client-only: load the builder with `next/dynamic` and `ssr: false` | Drag, scale, and rotate transforms, layer compositing, `toDataURL()` export                                           |
| Garment recolor      | Original vector templates (zone masks + multiply shading + screen highlight), built by `scripts/garments/build.mjs`                                                                                                              | Realistic color changes from a single photo template per view                                                         |
| Forms and validation | React Hook Form + Zod (shared schemas client and server)                                                                                                                                       | One schema, both sides                                                                                                |
| Database             | **Plain Postgres on the host (Render Postgres)**, accessed with **Drizzle ORM** (SQL migrations in `db/`)                                                                                      | Leads, coupons, uploads, quote requests. No vendor SDK, so any Postgres host works.                                   |
| File storage         | **Cloudflare R2** (S3 API) behind `src/lib/storage.ts`, account in the owner's name. Local dev: MinIO via `docker compose`; tests/CI: in-memory driver | Artwork and mockup PNGs. Decided 2026-11-24.                                                                          |
| Email                | **Resend** + React Email templates                                                                                                                                                             | Mockup delivery with coupon, owner notifications                                                                      |
| Payments / catalog   | **DECIDE: Square** (if they're already on Weebly/Square) **or Stripe Checkout**                                                                                                                | Keep their existing merchant setup if possible                                                                        |
| Anti-spam            | Cloudflare Turnstile on every public form                                                                                                                                                      | Email gate and upload forms will attract bots                                                                         |
| Hosting              | **Render**: always-on Node web service (Next.js `next start`) plus managed Postgres, defined in `render.yaml`. Fallback: Railway.                                                              | One dashboard and one bill, no serverless size limits, no free-tier database pause. See "Hosting and portability".     |
| Analytics            | Plausible or GA4 + Google Search Console                                                                                                                                                       | Funnel: builder start → gate → order                                                                                  |
| Testing              | Vitest (unit) + Playwright (e2e: builder flow, forms)                                                                                                                                          | The builder is the money path, so it needs e2e                                                                        |
| CI                   | GitHub Actions: lint, typecheck, unit tests, build, then e2e                                                                                                                                   | Every PR and push to `main`                                                                                           |
| Package manager      | pnpm                                                                                                                                                                                           |                                                                                                                       |

## Hosting and portability

**Decision (2026-11-23):** Render Node web service plus Render Postgres, in an account owned by the shop owner (his email, his card). He keeps his existing domain and points it at Render with DNS records at his registrar. Weebly stays live until cutover.

**Estimated cost:** about **$13/month** (Starter web service $7 plus Basic-256mb Postgres $6, per Render list prices checked 2026-11-23, before bandwidth and storage growth). Persistent disk, if we use it, is $0.25/GB/month. Re-check the pricing page before creating the account.

**Watch items**

- Starter has 512 MB RAM. If builds or image optimization run out of memory, move the web service up a tier (Standard, 2 GB, about $25).
- Confirm what backups and retention the chosen Postgres plan includes. If it's not enough, add a scheduled `pg_dump` to the bucket.
- Confirm the Hobby workspace terms cover a commercial site before opening the account.

**Portability rules (so switching hosts later is a config change, not a rewrite)**

1. Database access goes through Drizzle (or plain `pg`) using one `DATABASE_URL`. Never import a vendor SDK such as `supabase-js`.
2. All file access goes through `src/lib/storage.ts`, which speaks the S3 API (endpoint, bucket, keys from env).
3. No host-specific features: no Vercel Blob/KV/Edge Config, no edge-only runtime code, no host-only cron. Scheduled jobs go through a documented script.
4. Config comes from env vars only. `render.yaml` is the only host-specific file, and a `Dockerfile`-free `pnpm build && pnpm start` must work anywhere Node 22 runs.
5. Migrations are plain SQL in `db/migrations`, so they run on any Postgres.

**Switching later:** `pg_dump` and restore the database, sync the bucket with an S3 tool, copy the env vars, and repoint the DNS records. The code does not change.

## High-level architecture

```
Browser ──► Next.js pages (SSG: home, about, business, services, city pages)
       │
       ├─► /design (client-side Konva builder)
       │      └─ on "Email me my mockup":
       │           POST /api/mockups  { email, garment, colors, views[], printLocations, notes, turnstileToken }
       │              ├─ validate (Zod) + verify Turnstile + rate-limit by IP/email
       │              ├─ upload original artwork + rendered mockup PNGs → Storage (src/lib/storage.ts)
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
mockups      id, lead_id, coupon_id, garment, colors jsonb, views jsonb
             (per view: view, printArea, transform{x,y,width,height,rotation,flipX}, mockupKey), sizes jsonb, notes,
             wants_quote, artwork_key/name/content_type/size_bytes, status (request_status), created_at
users        id, email (unique, lowercase), password_hash (scrypt), name, email_verified_at, lead_id, created_at, updated_at
sessions     id, user_id, token_hash (sha256 of cookie token, unique), created_at, expires_at (30 days)
auth_tokens  id, user_id, purpose (verify_email|reset_password), token_hash, attempts, expires_at, used_at
             mockups also carry kind (mockup|order) and user_id
coupons      id, lead_id (unique: one per email), code (unique), percent_off, min_order_cents,
             status (issued|eligible|redeemed|expired), issued_at, expires_at, redeemed_order_ref
orders       id, lead_id, provider (square|stripe), provider_order_id, total_cents, coupon_id, created_at
uploads      id, name, email, order_number, file_url, notes, created_at
quotes       id, company, name, email, phone, items jsonb, quantity, deadline, artwork_url, notes, status, created_at
contact_msgs id, name, email, message, created_at
```

### "15% off your 2nd order" logic

- Coupon issued at email-gate time: **one per email** (idempotent; resubmitting re-sends the same code).
- Code is unique and unguessable (e.g. `CHARLY-XXXX-XXXX`). Implemented in `src/lib/coupons.ts` (unit-tested).
- **Valid only if that email has ≥ 1 completed prior order.** Enforce server-side at checkout. Not enforceable by a generic discount code alone, so we either (a) validate in our checkout flow before creating the payment session, or (b) create the provider-side discount only after the first-order webhook fires and email "your 15% is now unlocked." **DECIDE** (default: (b), which is cleaner and keeps the provider as source of truth).
- **Rules (confirmed 2026-11-23):** one coupon per email · expires **365 days** after issue · **$30.00 minimum order** (subtotal before tax and shipping) · 15% off. Scope (catalog, custom, or both) defaults to both until the owner says otherwise.
- All owner notifications go to one inbox: `OWNER_NOTIFY_EMAIL=CHARLYSCORNERSTORE@GMAIL.COM`.

## Repo layout (target)

```
/
├─ AGENTS.md            # rules for opencode + any agent (canonical)
├─ CLAUDE.md            # imports AGENTS.md for Claude Code
├─ opencode.json        # extra instruction files for opencode
├─ README.md
├─ render.yaml          # Render blueprint: web service + Postgres (the only host-specific file)
├─ .github/workflows/   # CI
├─ docs/                # these project docs (mirrored in the claude.ai project)
├─ Assets/              # owner-supplied source files (not served)
├─ ScrapedData/         # raw research (read-only reference)
├─ public/
│  ├─ brand/            # logo for the web
│  └─ garments/         # template images per garment/view/layer
├─ src/
│  ├─ app/              # routes: (marketing)/, shop/, design/, upload/, business/, about/, api/
│  ├─ components/       # layout/, ui/ (primitives), neon/ (themed), builder/
│  ├─ lib/              # site, nav, db, storage, email, payments, coupons, validation (zod), turnstile
│  ├─ emails/           # React Email templates
│  └─ styles/           # tokens.css
├─ db/                  # Drizzle schema, SQL migrations, seed
└─ tests/               # e2e (unit tests sit next to source as *.test.ts)
```

## Environments and secrets

See `.env.example`. Never commit `.env*` (except the example). Secrets live in the Render service's environment settings (owner's account). Local dev uses `.env.local` with a local or dev Postgres.

## Decision log

| Date       | Decision                                                                                                                                                                     | Notes                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2026-11-23 | Next.js 16.4 + TS + Tailwind v4, fonts via `@fontsource`                                                                                                                     | Phase 0 scaffold                                                                          |
| 2026-11-23 | **Hosting: Render (Node web service + Render Postgres), owner-owned account, owner's existing domain.** Replaces the earlier "Vercel" and "Supabase" defaults. Fallback: Railway. | Logan. Owner OK with a small monthly fee (about $13). Portability rules above are mandatory. |
| 2026-11-23 | **DB provider: Postgres on Render via Drizzle; no vendor SDK**                                                                                                               | Closes the old "Supabase vs Neon" DECIDE                                                  |
| 2026-11-23 | Repo `violentwave/charlys-corner-store`; GitHub Actions CI (lint, typecheck, test, build, e2e)                                                                        | Phase 0                                                                                   |
| 2026-11-26 | **Repo is private** (Logan OK'd). Actions keep working on GitHub-hosted runners with the $0 spending limit unchanged — the 2026-11-23 blocker no longer reproduces on this repo (verified by green CI after the flip). Brand-new repos on the account may still be blocked (a scratch probe failed twice); the workaround if ever needed: a self-hosted runner (no billing) or a payment method on file. Free plan includes 2,000 Actions minutes/month — private-repo usage is metered, so watch the quota; `concurrency` cancel-in-progress is already on. | Logan / Claude |
| 2026-11-24 | **File storage: Cloudflare R2** (S3-compatible, free tier, owner's account). Render disk rejected: not S3, tied to one instance | Logan |
| 2026-11-24 | Phase 3 backend: Postgres rate limiting (no Redis), env-selected drivers for storage (s3/memory) and email (resend/console), Turnstile test keys in dev/CI, real-Postgres tests in CI | Claude |
| 2026-11-23 | Claude GitHub App installed on the repo: Claude can push branches, open PRs, read CI | Logan |
| 2026-11-23 | Coupon: 1 per email, 365-day expiry, $30 min, 15%                                                                                                                            | Owner answer                                                                              |
| 2026-11-23 | Builder ships 6 garments (adds Polo + Tank)                                                                                                                                  | Owner answer                                                                              |
| 2026-11-23 | Owner notifications go to one inbox: CHARLYSCORNERSTORE@GMAIL.COM                                                                                                            | Owner answer                                                                              |
| 2026-11-25 | **Garment templates: original vector drawings (Option A)**, neutral/realistic, no site theme on garments or canvas backdrop. Layer contract in docs/04 | Logan |
| 2026-11-25 | **Customer accounts: email + password** (scrypt via `node:crypto`, hashed session tokens in Postgres, httpOnly cookie, email verified by 6-digit code, reset by one-time link). Account required before uploading artwork or sending a mockup/order. "My designs" + order history for signed-in users. No auth vendor (portability) | Logan (options) / Claude (implementation) |
| 2026-11-25 | **Builder colors: full Gildan list per style, hue-sorted strip, no custom hex** (server-enforced) | Logan |
| 2026-11-25 | **Builder has two paths: "Email me this mockup" and "Order this design" (order request; owner confirms price + invoices)**. Online payment for custom orders waits for pricing + Square/Stripe | Logan |
| 2026-11-25 | **Builder v3:** add Long Sleeve Tee (Gildan 5400); sleeve views (left/right) on long-sleeve garments; uploads go on one side, with same or different art per side (`artwork-<n>` + `views[].artwork`, `mockups.artworks`); realistic colors: hoodie one color (lining/drawcords match), baseball tee (Bella+Canvas 3200) and trucker hat (Richardson 112) pick from real combos only, server-enforced | Logan |
| 2026-11-25 | **Builder v4: layers (image + text, ≤ 8 per side), stretch + skew, text tool with 8 self-hosted fonts** (Anton, Bebas Neue, Oswald, Montserrat, Graduate, Permanent Marker, Pacifico, Playfair Display; OFL / Apache 2.0). Precision tools, background removal and saved drafts deferred | Logan |
| 2026-11-25 | **The mockup builder is the top of the home page** (first thing visitors see); `/design` stays as its own page for links, email CTAs and restore links | Logan |
| 2026-11-26 | **Hybrid one-page Home (Logan): builder, upload and summary sections on Home with a sticky header that scrolls to them; Business, About, Contact stay full pages for SEO; only /design and /upload redirect to Home.** | Logan |
| 2026-11-25 | **Canvas lib: Konva + react-konva** (MIT licensed, free for commercial use) | Logan |
| 2026-11-25 | Phase 4 backend: `coupons` (one per lead, unique index) + `mockups` tables (migration 0001); `issueCoupon()` idempotent and race-safe; shared `mockupPayloadSchema` | Claude |
| 2026-11-26 | **File retention (Logan):** emailed-mockup files (`mockups/` in R2: originals + rendered PNGs) are deleted after **30 days** (first set to 3, changed to 30 the same night) by the R2 object lifecycle rule `delete-mockups-30-days`; order-request files (`orders/`), existing-order uploads (`uploads/`) and quote files (`quotes/`) are kept. Constant in `src/lib/retention.ts`; after expiry a restore link brings back colors and text only | Logan |
|            | Payments provider                                                                                                                                                            | DECIDE, waiting on owner (Brief Q2)                                                       |
|            | Coupon enforcement approach                                                                                                                                                  | DECIDE (default (b))                                                                      |
