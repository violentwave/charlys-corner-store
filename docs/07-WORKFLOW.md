# Workflow: claude.ai + opencode + GitHub

## Who does what
| Tool | Use it for |
|---|---|
| **claude.ai project** ("Charly's CornerStore") | Planning, specs, design decisions, copywriting, reviewing diffs you paste in, generating opencode task prompts, keeping `docs/` current |
| **opencode** (in `/home/lch/Projects/Charly`) | Writing code, running the dev server, tests, migrations, git commits. Reads `AGENTS.md` automatically. |
| **GitHub (private repo)** | Source of truth for code + docs. PR per task; Vercel preview on every PR. |

## Local setup (one time)
Requirements: git, Node ≥ 20.9 (22 LTS recommended), pnpm (`corepack enable`), opencode.
```bash
cd ~/Projects/Charly
git init -b main
git remote add origin https://github.com/violentwave/charlys-corner-store.git   # or git@github.com:… for SSH
git fetch origin
git reset origin/main          # adopt repo history; your local files stay in place
git status                     # should be clean (or only show local-only extras)
pnpm install
pnpm exec playwright install chromium
cp .env.example .env.local
pnpm dev                       # http://localhost:3000 shows the neon placeholder
```
Then start opencode from the repo root (`opencode`). It reads `AGENTS.md` and the docs listed in `opencode.json`.

## The loop
1. **Plan in claude.ai.** Pick the next roadmap checkbox → ask Claude for an *opencode task prompt* (scope, files to touch, acceptance criteria, tests).
2. **Build in opencode.** Paste the prompt. opencode follows `AGENTS.md`. One branch per task: `feat/builder-recolor`, `fix/upload-size-limit`.
3. **Verify:** `pnpm lint && pnpm typecheck && pnpm test` (+ `pnpm e2e` for builder/forms) and click through the Vercel preview on a phone.
4. **Review in claude.ai** (paste the diff or PR link if a GitHub connection is available) → merge.
5. **Sync docs.** If a decision was made, update the doc (Decision Log, roadmap checkbox) in the repo **and** in the claude.ai project so both stay in step.

## Task prompt template (for opencode)
```
Task: <one roadmap item>
Context: read AGENTS.md and docs/<relevant spec>.md first.
Scope: only touch <paths>. Do not refactor unrelated code.
Requirements:
- ...
Acceptance criteria:
- [ ] ...
Tests: <unit/e2e to add>
Done when: lint, typecheck, and tests pass; summarize changed files and any follow-ups.
```

## Keeping the claude.ai project useful
- Project knowledge = the `docs/` folder. When a doc changes in the repo, re-upload or overwrite it in the project.
- Don't upload all of `ScrapedData/`. `05-RESEARCH-DIGEST.md` summarizes it. Add a single raw file only when a chat needs its details.
- Start each chat with what you're working on ("Phase 4: recolor compositor").

## Git conventions
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `test:`
- Never commit `.env*` (except `.env.example`), customer uploads, or large binaries outside `public/garments/`
- Squash-merge PRs into `main`
