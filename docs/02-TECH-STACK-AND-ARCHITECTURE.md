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
uploads      the Home order form (P52-1, 2026-11-26; new + existing orders, guests or members): id, lead_id, user_id?,
             order_type (new|existing), first_name, last_name?, email, phone?, company?, order_number?, fulfillment (pickup|ship)?,
             address jsonb?, items text[], colors?, print_method (recommend|method id), print_locations text[], sizes jsonb,
             needed_by?, files jsonb [{key,name,contentType,size}] (≤ 5, under uploads/, kept), notes?, referral_*, marketing_opt_in,
             legacy single-file columns (file_key…) kept for old rows
quotes       id, company, name, email, phone, items jsonb, quantity, deadline, artwork_url, notes, status, created_at
contact_msgs id, name, email, message, created_at
```

### "15% off your 2nd order" logic

- **Coupon issued after the customer's first paid order (2026-11-26, Logan)**: never shown or emailed at mockup / order-request time. `markOrderPaid` (`src/lib/payments.ts`) creates it (already eligible) on the first paid order and emails the code in "Payment received". **One per customer** (one per lead/email, idempotent).
- Code is unique and unguessable (e.g. `CHARLY-XXXX-XXXX`). Implemented in `src/lib/coupons.ts` (unit-tested).
- **Valid only if that email has ≥ 1 paid prior order**, enforced server-side: `priceOrder` applies it to the next quoted order automatically (`checkCoupon`), and it's redeemed when that order is paid.
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
| 2026-11-23 | **Repo is public for now**; go private before any sensitive data enters the repo (customer data, real pricing deals, non-public client info). Secrets never go in the repo either way. | Logan. Private mode needs the GitHub Actions budget fixed first (private-repo CI was blocked by a $0 budget). |
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
| 2026-11-26 | **Members v2 (Logan):** sign in with **email + password or Google** (Meta dropped). Google = OpenID Connect code flow + PKCE via plain `fetch` (no SDK), env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; same verified email links to the existing account, an unverified one is claimed (password removed). **2FA optional per member: authenticator app (TOTP, secrets AES-256-GCM encrypted with `AUTH_ENCRYPTION_KEY`) or a code by email, plus 10 backup codes**; asked after every first factor (password, Google, reset link). **Members stay signed in:** sessions slide a year ahead on use and end only on sign-out, a password reset/change (all sessions revoked) or account deletion, so the 2FA code is needed only at the next sign-in. Members delete emailed mockups (row + files); order requests are hidden, kept for the shop. New dependency: `qrcode` (MIT) for the setup QR | Logan (choices) / Claude (implementation) |
| 2026-11-26 | **Member perks (Logan):** coupon wallet, order tracking (stages received → price sent → in production → ready → completed / cancelled; the owner moves an order with signed one-click links in his order email that open a confirm page, no admin panel; the customer gets a short email per change), saved drafts, brand kit, order again, saved sizes / team rosters, account settings (name, marketing emails), change password (ends every session), re-send a mockup email. All on Postgres + R2, no new services | Logan |
| 2026-11-26 | **Payments: Square (the owner's existing account).** Checkout = **Square-hosted payment links (Checkout API)**: cards, Apple Pay, Google Pay, Cash App Pay, Afterpay on Square's page; no PayPal (Square can't take it). Two flows: custom orders are **quote → pay** (owner sets the price from his order email → customer gets a payment link; members pay from order tracking, guests from the email) and shop items are **cart → the same hosted checkout** with Square catalog prices. A Square webhook marks orders paid and unlocks the 15% coupon (coupon option (b)). **Saved cards for members:** payment links can't save cards, so "Add a card" uses the Web Payments SDK card form (tokenized by Square, card data never touches our server) + the Cards API with explicit consent; "Pay with saved card" charges it server-side (Payments API). All Square calls via plain `fetch` (no SDK dependency); config by env (`SQUARE_ENVIRONMENT`, `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `NEXT_PUBLIC_SQUARE_APPLICATION_ID`). Build against Logan's **sandbox** first; switching to the owner = env change (saved cards and customers belong to one seller account, so nothing real is saved before the switch). | Logan |
| 2026-11-26 | **Coupon after the first paid order (Logan):** no code at mockup / order-request time; created and emailed when the first order is paid; one per customer. Supersedes the "email gate delivers the coupon" plan. | Logan |
| 2026-11-26 | **Mockup limits raised (Logan):** 500 sends a day per member (`LIMITS.mockupEmail`), 300 an hour per network; member emails to their own verified address skip the 3-a-day confirmation cap (that cap is for public forms). Only verified members can send mockups. | Logan |
| 2026-11-26 | **One print method per garment (Logan)**, not per side: offered only when it fits every printed side; the server rejects mixed methods. | Logan |
| 2026-11-26 | **Print methods (Logan): every in-house method is listed** (screen printing, DTF, DTG, embroidery, sublimation, heat-transfer vinyl) **and filtered** per garment fabric, color and print area; "Recommend one for me" is the default. Rules in `src/lib/print-methods.ts`, re-checked server-side. | Logan |
| 2026-11-26 | **Performance tees (Logan):** add Gildan **42000** Performance Tee (19 colors) and **42400** Performance Long Sleeve (8 colors, hemmed cuffs), 100% polyester, S–3XL. Gildan's spec sheets make **no UPF claim**, so the site doesn't advertise UV protection until the owner confirms (Brief Q13). | Logan |
|            | Payments provider                                                                                                                                                            | ✅ Square (2026-11-26, above)                                                              |
|            | Coupon enforcement approach                                                                                                                                                  | DECIDE (default (b))                                                                      |
