# ProSync Workforce Platform

Workforce tracking and HR operations for ProSync. A desktop agent records work
activity. A backend turns that activity into attendance, analytics and daily
reports. Two web dashboards serve admins/HR and employees/managers.

| App | Path | Stack | Dev port |
| --- | --- | --- | --- |
| Backend API | `apps/backend` | Express 5, Mongoose 9, TypeScript | 5000 |
| Admin dashboard | `apps/admin-dashboard` | Next.js 15, React Query | 3000 |
| Employee dashboard | `apps/employee-dashboard` | Next.js 15, React Query | 3001 |
| Desktop agent | `apps/desktop-agent` | Electron 31, electron-vite, SQLite queue | 5173 (renderer) |
| Shared types | `packages/shared-types` | Event and report types used by all apps | - |

This is a pnpm + Turborepo monorepo. Production runs on a Hostinger VPS (PM2), and
**every push to `main` deploys it**.

## Quick start

You need Node 22 LTS, Docker Desktop and pnpm (`corepack enable` once).

```bash
pnpm install
pnpm setup:dev      # create local .env files from the examples (never overwrites)
pnpm db:dev         # start the local MongoDB container
pnpm seed:dev       # reset it with ~2 weeks of realistic data
pnpm dev:web        # API + both dashboards
```

To do all of that in one go, run `pnpm dev:up`. It sets up the env files, starts the DB, seeds it only if empty, and starts the web apps.

Open http://localhost:3000 (admin) or http://localhost:3001 (employee) and log
in as `admin@dev.local` / `Password@123`. The full list of seeded logins is in
[docs/seed-data.md](docs/seed-data.md).

> **Local development never touches production.** The dev server and the seed
> refuse to start unless `MONGO_URI` points at a local database, and dev builds
> of the desktop agent call `localhost:5000`. Never paste production values
> into a local `.env`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm setup:dev` | Create `apps/*/.env(.local)` from `.env.example` if missing |
| `pnpm db:dev` / `db:dev:stop` / `db:dev:logs` | Start / stop / tail the dev MongoDB (`docker-compose.dev.yml`) |
| `pnpm db:dev:reset` | Delete the dev DB volume and start empty |
| `pnpm seed:dev` | Drop and reseed the local DB (add `--if-empty` to skip when data exists) |
| `pnpm dev` | All four apps, including the Electron agent |
| `pnpm dev:web` | Backend + both dashboards |
| `pnpm dev:api` / `dev:admin` / `dev:employee` / `dev:agent` | A single app |
| `pnpm dev:up` | setup:dev → db:dev → seed if empty → dev:web |
| `pnpm test` / `pnpm test:api` | All tests / backend tests only |
| `pnpm build` / `pnpm check-types` | Build / type-check everything |

## Documentation

- [docs/local-development.md](docs/local-development.md): setup, daily workflow, troubleshooting
- [docs/project-map.md](docs/project-map.md): where everything lives (start here when changing code)
- [docs/architecture.md](docs/architecture.md): how the pieces fit together
- [docs/environment-variables.md](docs/environment-variables.md): every env var per app
- [docs/seed-data.md](docs/seed-data.md): what the dev seed creates, and how to extend it
- [docs/testing.md](docs/testing.md): running and writing tests
- [docs/human-actions.md](docs/human-actions.md): steps that need a person (secrets, releases, rotation)- [docs/HOSTINGER_GITHUB_DEPLOYMENT.md](docs/HOSTINGER_GITHUB_DEPLOYMENT.md) and [docs/vps-performance.md](docs/vps-performance.md): production operations

Contributors and AI agents must follow [AGENTS.md](AGENTS.md): branch first, and
update docs, the seed and tests before every commit.
