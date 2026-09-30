# Local development

Everything runs on your machine against a **local** MongoDB in Docker. Nothing
in this guide touches production.

## Prerequisites (once)

| Tool | Notes |
| --- | --- |
| Node.js 22 LTS | Node 20+ works. Check with `node -v`. |
| pnpm 9 | Run `corepack enable` (ships with Node). The repo pins `pnpm@9.1.0`; npm/yarn installs are blocked. |
| Docker Desktop | Must be running before `pnpm db:dev`. |
| MongoDB Compass (optional) | Connect to `mongodb://127.0.0.1:27017/workforce_dev` to browse data. |

## First run

```bash
pnpm install
pnpm setup:dev   # apps/backend/.env, apps/*-dashboard/.env.local
pnpm db:dev      # container "workforce-dev-mongo" on 127.0.0.1:27017
pnpm seed:dev    # ~10 s; prints row counts and the login table
pnpm dev:web     # API :5000, admin :3000, employee :3001
```

Or run everything in one step: `pnpm dev:up`.

Every seeded account uses the password `Password@123`. Useful ones:

| Login | Role | Dashboard |
| --- | --- | --- |
| `superadmin@dev.local` | Super Admin | admin (3000) |
| `admin@dev.local` | Admin | admin (3000) |
| `hr@dev.local` | HR | admin (3000) |
| `arjun@dev.local` | Manager, Engineering | employee (3001) |
| `priya@dev.local` | Employee, Engineering | employee (3001) |

See [seed-data.md](seed-data.md) for the rest.

## Daily loop

```bash
pnpm db:dev        # if the container is stopped (it is a no-op when running)
pnpm dev:web       # or dev:api / dev:admin / dev:employee
pnpm test          # before committing
```

Reseed whenever you want a clean slate: `pnpm seed:dev`. Seeded dates are
relative to today, so run it again after a few days to keep "today" populated.

## Desktop agent

`pnpm dev:agent` starts Electron against `http://localhost:5000/api`. The URL
comes from `apps/desktop-agent/.env.development`. Two things differ from a
release build:

- Dev builds use a separate profile (`…/userData-dev`). They never share the
  offline queue or login with an installed production agent.
- Packaged builds always use the production API. Change the URL only in
  `src/shared/api-url.ts`.

Log in with a seeded employee (e.g. `priya@dev.local`). The root `.npmrc`
points native module builds (`better-sqlite3`) at Electron's headers. Don't
remove it.

## Reset and cleanup

| Goal | Command |
| --- | --- |
| Fresh data, same container | `pnpm seed:dev` |
| Delete the database volume entirely | `pnpm db:dev:reset` |
| Stop Mongo (keeps data) | `pnpm db:dev:stop` |

## Safety rails (and how to trip them)

- `pnpm dev:api` sets `DEV_DB_GUARD=1`. The server then refuses to boot unless
  `MONGO_URI` is `localhost`, `127.0.0.1`, `::1` or `mongo`. Setting
  `ALLOW_REMOTE_DB=true` overrides this. Only do that if you really mean it.
- `pnpm seed:dev` has no override: it never runs against a remote DB or
  with `NODE_ENV=production`.
- Discord, Teams, CRM and Sheets webhooks are empty in `.env.example`, so
  nothing is posted from dev. The seed also blanks them itself.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `failed to connect to the docker API` | Start Docker Desktop, then `pnpm db:dev` again. |
| Port 27017 already in use | A local `mongod` is running. Stop it, or run `DEV_MONGO_PORT=27018 pnpm db:dev` and change `MONGO_URI` in `apps/backend/.env` to match. |
| `Refusing to run: MONGO_URI points at a non-local database` | Your `apps/backend/.env` has a remote URI. Delete the file and run `pnpm setup:dev`. |
| `Use "pnpm install" for installation in this project` | You ran npm or yarn. Use pnpm. |
| Dashboard login loops back to /login | The API isn't running, or `NEXT_PUBLIC_API_URL` in `.env.local` is wrong (it must have no `/api` suffix). |
| Seed data looks stale ("today" is empty) | `pnpm seed:dev` again. The data is anchored to the day you seeded. |
