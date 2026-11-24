# Charly's Corner Store: Website 🌴🐾

Custom website for Charly's Corner Store Tees & Apparel (Port St. Lucie, FL): custom tees, hats, hoodies, and promo products, with a neon Miami Vice look and a build-your-own mockup tool.

> Status: **Phase 0, setup (mostly done).** See [`docs/06-ROADMAP.md`](docs/06-ROADMAP.md).

Next.js 16.4 · TypeScript · Tailwind v4 · Vitest · Playwright · pnpm · GitHub Actions CI.

## Docs

- [Project brief](docs/00-PROJECT-BRIEF.md)
- [Current site inventory and parity checklist](docs/01-CURRENT-SITE-INVENTORY.md)
- [Tech stack and architecture](docs/02-TECH-STACK-AND-ARCHITECTURE.md)
- [Design system](docs/03-DESIGN-SYSTEM.md)
- [Mockup builder spec](docs/04-MOCKUP-BUILDER-SPEC.md)
- [Research digest](docs/05-RESEARCH-DIGEST.md)
- [Roadmap](docs/06-ROADMAP.md)
- [Workflow](docs/07-WORKFLOW.md)

## Getting started

```bash
corepack enable              # provides pnpm
pnpm install
cp .env.example .env.local   # fill in values as services get added
pnpm dev                     # http://localhost:3000
```

| Command                                      | Does                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | ESLint / tsc / Vitest                                            |
| `pnpm e2e`                                   | Playwright (first time: `pnpm exec playwright install chromium`) |
| `pnpm build`                                 | Production build                                                 |
| `pnpm format`                                | Prettier + Tailwind class sorting                                |

Full local + opencode setup: [`docs/07-WORKFLOW.md`](docs/07-WORKFLOW.md).

Folders: `src/` app code · `docs/` specs (mirrored in the claude.ai project) · `Assets/` owner-supplied source files · `ScrapedData/` raw research (reference only).

Have a Ruffin awesome day.
