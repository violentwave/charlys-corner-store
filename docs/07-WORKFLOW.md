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
3. **Verify + ship (agent):** the agent runs format/lint/typecheck/test/e2e locally, then follows the prompt's **Ship** section: push, open PR, wait for CI, squash-merge when green, delete the branch, return to an updated `main`. Default since 2026-11-23 (Logan).
4. **Spot-check:** click through `main` locally (`pnpm dev`) or on the deploy, on a phone. Ask Claude to review any merged PR by number; fixes go in a follow-up PR.
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
Done when: format:check, lint, typecheck, test (and e2e if UI/forms) pass; tick the roadmap checkbox in docs/06-ROADMAP.md in the same commit.
Ship:
1. git push -u origin HEAD
2. gh pr create --base main --fill  (body: summary, files changed, how tested, roadmap checkbox)
3. sleep 20 && gh pr checks --watch --fail-fast. If a check fails: gh run view --log-failed, fix on this branch, commit, git push, repeat (max 3 attempts, then stop and report).
4. When all checks pass: gh pr merge --squash --delete-branch
5. git switch main && git pull --prune
6. Report: PR URL, merge commit SHA, files changed, follow-ups.
Never force-push, push to main, or merge with failing/pending checks.
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
- Agents (opencode, or Claude via the Claude GitHub App) push, open PRs, and squash-merge only when the prompt has a **Ship** section and CI is green. Never force-push, never push to `main`, never change git config or remotes.
