# Workflow: claude.ai + opencode + GitHub

## Who does what

| Tool                                           | Use it for                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **claude.ai project** ("Charly's CornerStore") | Planning, specs, design decisions, copywriting, reviewing diffs you paste in, generating opencode task prompts, keeping `docs/` current |
| **opencode** (in `/home/lch/Projects/Charly`)  | Writing code, running the dev server, tests, migrations, git commits. Reads `AGENTS.md` automatically.                              |
| **GitHub** (`violentwave/charlys-corner-store`, public for now) | Source of truth for code + docs. PR per task; CI on every PR; Render deploys `main` (and PR previews if the plan includes them). |

## Local setup (one time, already mostly done)

The folder `~/Projects/Charly` is already a clone of the GitHub repo. Remaining one-time steps:

```bash
# git identity (commits otherwise fail with "Author identity unknown")
git config --global user.name "violentwave"
git config --global user.email "92730846+violentwave@users.noreply.github.com"

# pnpm (no sudo). Logan's Node has no corepack, so install pnpm with npm into ~/.local
npm i -g pnpm --prefix ~/.local     # ~/.local/bin must be on PATH
pnpm -v

cd ~/Projects/Charly
pnpm install
pnpm exec playwright install chromium
cp .env.example .env.local
pnpm dev                       # http://localhost:3000
```

Fresh machine instead? `git clone https://github.com/violentwave/charlys-corner-store.git` and run the same steps.

Start opencode from the repo root (`opencode`). It reads `AGENTS.md` and the docs listed in `opencode.json`.

## The loop

1. **Plan in claude.ai.** Pick the next roadmap checkbox → ask Claude for an _opencode task prompt_ (scope, files to touch, acceptance criteria, tests).
2. **Build in opencode.** Start from an up-to-date `main` (`git switch main && git pull`), then paste the prompt. opencode follows `AGENTS.md`. One branch per task: `feat/builder-recolor`, `fix/upload-size-limit`.
3. **Verify:** `pnpm lint && pnpm typecheck && pnpm test` (+ `pnpm e2e` for builder/forms) and click through the preview deploy (or local `pnpm build && pnpm start`) on a phone.
4. **Push + PR:** `git push -u origin <branch>`, open a PR (`gh pr create --fill`), wait for CI.
5. **Review in claude.ai** (paste the diff: `git diff main...<branch>`) → squash-merge.
6. **Sync docs.** If a decision was made, update the doc (Decision Log, roadmap checkbox) in the repo **and** in the claude.ai project so both stay in step.

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
Done when: lint, typecheck, and tests pass; commit on branch <name>; summarize changed files and any follow-ups. Don't push.
```

## Keeping the claude.ai project useful

- Project knowledge = the `docs/` folder + `AGENTS.md`. **One copy per doc**, stored at the same path as in the repo (`docs/00-PROJECT-BRIEF.md`, `AGENTS.md`). When a doc changes, overwrite that path; don't add a second copy.
- Edits made in a chat don't reach the project until that chat saves them to the project doc (or you upload the file).
- Don't upload all of `ScrapedData/`. `05-RESEARCH-DIGEST.md` summarizes it. Add a single raw file only when a chat needs its details.
- Start each chat with what you're working on ("Phase 4: recolor compositor").

## Git conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `test:`
- Never commit `.env*` (except `.env.example`), customer uploads, or large binaries outside `public/garments/`
- Squash-merge PRs into `main` (this also sets the commit author to you)
- opencode never changes git config, creates remotes, or pushes; Logan pushes its branches
- Claude (claude.ai/Claude Code session, via the Claude GitHub App) may push its own branches and open PRs; Logan merges
