# AGENTS.md

These rules apply to every contributor, human or AI agent (Claude Code,
Codex, Cursor, …). `CLAUDE.md` loads this file.

## Start here

1. Read **[docs/project-map.md](docs/project-map.md)** before searching the
   codebase. It says which files own which behaviour, so open those first.
   Search more widely only if the map doesn't cover it, and then fix the map.
2. Local setup and commands: [README.md](README.md) and
   [docs/local-development.md](docs/local-development.md).

```bash
pnpm install && pnpm setup:dev && pnpm db:dev && pnpm seed:dev   # once
pnpm dev:web          # API :5000, admin :3000, employee :3001
pnpm test             # all tests (pnpm test:api for backend only)
pnpm --filter @workforce/backend build   # the tsc build prod deploys with
```

Use **pnpm** only. npm and yarn are blocked, and there is no package-lock.json.

## Branching (before making any change)

- Before you edit anything, create a branch from an up-to-date `main`:
  `feat/…`, `fix/…`, `chore/…` or `docs/…`. The only exception is when the user
  explicitly says to work on the current branch.
- Never commit directly to `main`.
- Never push `main`. **Every push to `main` deploys production**
  (`.github/workflows/deploy.yml`). Push other branches only when asked.

## Safety rules

- Local development uses only the local database from `pnpm db:dev`. Never put
  production URIs, keys or webhook URLs in a local `.env`. Never weaken the
  guards in `apps/backend/src/scripts/_guards.ts`.
- Never hard-code connection strings, credentials, tokens or backend URLs. Read
  configuration through `apps/backend/src/config/env.ts`,
  `NEXT_PUBLIC_API_URL`, or the desktop agent's `src/shared/api-url.ts`.
- Never run a data-writing script (`recompute-day`, `seed:admin`, one-off fixes)
  against a remote database. Tell the human what to run instead, and add the
  step to `docs/human-actions.md` if it's recurring.
- Don't add throwaway debug scripts at the repo root or in app folders. Put
  reusable tools in `apps/backend/src/scripts/`, reading `MONGO_URI` from env.

## Before every commit (mandatory checklist)

Go through every item. Each is either done or not applicable to this change.

1. **README.md**: update it if setup, commands, scripts, apps or ports changed.
2. **docs/**: update the relevant doc if behaviour, architecture, jobs, env vars
   or human-only steps changed (`architecture.md`, `local-development.md`,
   `human-actions.md`, …). Keep the docs short.
3. **docs/project-map.md**: update it if files, modules, routes, pages,
   models or flows were added, moved, renamed or removed. The map must match the
   code.
4. **Seed**: if a model, field, enum or collection changed, update
   `apps/backend/src/scripts/seed/dev-dataset.ts` (plus `_all-models.ts` and
   `docs/seed-data.md`), and check that `pnpm seed:dev` still runs.
5. **Env**: for a new or changed variable, update the app's `.env.example` and
   `docs/environment-variables.md`.
6. **Tests**: add or update tests for any changed behaviour. Every bug fix gets a
   test that fails without the fix. `pnpm test` must pass.
7. **Build**: `pnpm --filter @workforce/backend build` and
   `pnpm check-types` must pass.

In the commit message or PR description, say which checklist items applied.
