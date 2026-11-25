# AGENTS.md: Charly's Corner Store website

Instructions for any coding agent (opencode, Claude Code, etc.) working in this repo. Read this first, every session.

## Project

Custom website for **Charly's Corner Store Tees & Apparel**, a custom apparel and screen-printing shop in Port St. Lucie, FL. It replaces a Weebly site. Theme: **Miami Vice / neon synthwave / light cyberpunk**. Flagship feature: **Build-Your-Own Mockup** (`/design`) with an email gate that delivers the mockup plus a 15% off 2nd order coupon.

## Read before coding

| When working on          | Read                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| Anything                 | `docs/00-PROJECT-BRIEF.md`                                        |
| Pages, forms, migration  | `docs/01-CURRENT-SITE-INVENTORY.md` (feature parity is mandatory) |
| Architecture, data, APIs | `docs/02-TECH-STACK-AND-ARCHITECTURE.md`                          |
| Any UI                   | `docs/03-DESIGN-SYSTEM.md`                                        |
| `/design` builder        | `docs/04-MOCKUP-BUILDER-SPEC.md`                                  |
| SEO, copy, competitors   | `docs/05-RESEARCH-DIGEST.md`                                      |
| What's next              | `docs/06-ROADMAP.md`                                              |

`ScrapedData/` is raw research: read-only reference, never import from it at runtime.
`Assets/` holds source brand and product files from the owner (`Assets/Logo.png`, `Assets/Clothes/`). Copy or optimize what the site needs into `public/`; never serve from `Assets/`.

## Repo map

```
src/app/            routes (App Router)          src/lib/site.ts      confirmed business facts (no invented values)
src/components/layout/  header, footer          src/lib/nav.ts       nav items
src/styles/tokens.css  design tokens (docs/03)  src/lib/coupons.ts   coupon rules + checks (unit-tested)
src/content/        catalog, services, about, portfolio (facts only; TODO(content) for unknowns)
src/lib/schemas.ts  shared Zod form schemas     src/components/ui/   primitives    src/components/neon/  Hero, CouponTicket, ComingSoon
db/schema.ts        Drizzle schema → `pnpm db:generate` writes db/migrations/*.sql; `pnpm db:migrate` applies them
src/lib/db.ts       getDb() (server-only)       src/lib/leads.ts     upsertLead()
src/lib/storage.ts  getStorage(), buildObjectKey()  (R2 / MinIO / memory)
src/lib/email.ts    sendEmail(), ownerInbox()   src/lib/turnstile.ts verifyTurnstile()
src/lib/rate-limit.ts rateLimit(), clientIp(), LIMITS   src/lib/artwork.ts checkArtwork() (byte sniffing)
src/lib/action-result.ts ActionResult, zodFieldErrors()  src/test/db.ts real-Postgres test helper
src/lib/notify.ts   notifyOwner(), confirmCustomer() (per-recipient cap)   src/lib/http.ts readFormDataLimited(), fileParts(), clip()
src/lib/garments.ts garment config (zones, palettes, print areas, layers)   src/lib/mockup-schema.ts mockupPayloadSchema (/api/mockups wire format)
src/lib/coupon-store.ts issueCoupon() (idempotent, server-only)   scripts/garments/ garment template generator (writes public/garments)
tests/e2e/          Playwright specs             public/brand/        logo for the web
render.yaml         Render blueprint (the only host-specific file)
```

## Stack

**Next.js 16.4** (App Router; read the docs in `node_modules/next/dist/docs/` before using an API, see the block at the bottom) + TypeScript (strict) · Tailwind (tokens in `src/styles/tokens.css`) · shadcn/ui primitives · Konva + react-konva for the builder (client-only via `next/dynamic` with `ssr: false`) · React Hook Form + Zod · **plain Postgres via Drizzle ORM** · **S3-compatible file storage** (provider per Decision Log) · Resend + React Email · Cloudflare Turnstile · Vitest + Playwright · pnpm · **hosted on Render as a Node web service** (`pnpm build && pnpm start`). Fonts are self-hosted via `@fontsource` packages (Poppins body, Orbitron headings, JetBrains Mono); don't switch to `next/font/google`.
If `docs/02` marks something **DECIDE** and it isn't in the Decision Log yet, stop and ask instead of choosing.

## Commands

```
pnpm dev        # local dev
pnpm lint
pnpm typecheck
pnpm test       # vitest
pnpm e2e        # playwright (first time: pnpm exec playwright install chromium)
pnpm build
pnpm format     # prettier (+ tailwind class sorting)
pnpm db:generate  # after editing db/schema.ts (commit the generated SQL)
pnpm db:migrate   # apply migrations to DATABASE_URL
docker compose up -d  # local Postgres + MinIO
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build, then e2e, on every PR and on pushes to `main`.
A task isn't done until `lint`, `typecheck`, and `test` pass (and `e2e` for builder or form changes).

## Rules

- **Scope:** do only the task asked. No drive-by refactors, no new dependencies without saying why.
- **Server is the source of truth:** validate every form server-side with the same Zod schema; verify Turnstile; rate-limit public endpoints; coupons are issued and validated only on the server.
- **Backend pattern (every public form):** server action / route handler → validate every argument with a shared Zod schema (server-action args are public input, types aren't enforced) → `verifyTurnstile` → `rateLimit(LIMITS.x)` keyed by `clientIp` → `upsertLead` + insert row (wrap in try/catch → friendly error) → `notifyOwner()` + `confirmCustomer()` from `src/lib/notify.ts` → return `ActionResult`. Rules: row first, email second; confirmations never echo free text the visitor typed (`clip()` short fields); multipart bodies go through `readFormDataLimited()`; validate all files with `checkArtwork` before storing any, and delete stored files if the insert fails; never store raw IPs; Turnstile tokens are single-use, so forms refresh the widget after every attempt.
- **Secrets:** env vars only (`.env.local`, documented in `.env.example`). Never commit secrets or customer uploads.
- **Portability (hosting can change):** the database is reached only through Drizzle/`pg` with one `DATABASE_URL`; never import a vendor SDK (`supabase-js`, etc.). All file reads and writes go through `src/lib/storage.ts` (S3 API, config from env). No host-specific features (no Vercel Blob/KV/Edge Config, no edge-only runtime code, no host-only cron). Migrations are plain SQL in `db/migrations`. `render.yaml` is the only host-specific file. The app must run with `pnpm build && pnpm start` on any Node 22 host.
- **Design tokens:** never hard-code neon hex values in components; use tokens or Tailwind theme classes.
- **Accessibility:** WCAG 2.2 AA, visible cyan focus rings, keyboard-operable builder, `prefers-reduced-motion` respected, color never the only signal.
- **Mobile first:** test at 360px wide.
- **Images:** `next/image`; garment templates live in `public/garments/{garment}/{view}/{base|shading|mask-<zone>}.png` and must be same-origin (canvas export).
- **Content:** page copy and facts come from `src/content/*` and `src/lib/site.ts`. Never invent prices, hours, phone, turnaround, minimums, or testimonials; add a `TODO(content)` and leave it out of the rendered page instead.
- **Copy voice:** fun, local, confident, a little punny (Charly is a dog: "Have a Ruffin awesome day"). No lorem ipsum in merged code; use clearly marked `TODO(content)` placeholders.
- **Commits:** conventional commits; one logical change per commit; branch per task, created from an up-to-date `main`.
- **Git hygiene:** never change git config (no `user.name`/`user.email`, local or global), never add or change remotes, never create GitHub repos, never force-push, never commit or push directly to `main`.
- **Shipping (opencode or Claude):** when the task prompt includes a **Ship** section, the agent may push its task branch, open a PR with `gh`, wait for CI, and squash-merge it, but only when every CI check has passed. Never merge with failing or pending checks; after 3 failed fix attempts, stop and report. Without a Ship section: commit on the task branch and stop.
- When done, report: files changed, how to test, open questions or follow-ups, and which roadmap checkbox this closes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
