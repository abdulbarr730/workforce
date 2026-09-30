# Testing

[Vitest](https://vitest.dev) in every app, run through Turborepo.

```bash
pnpm test                             # everything
pnpm test:api                         # backend only
pnpm --filter @workforce/backend test:watch
pnpm --filter desktop-agent test
```

CI (`.github/workflows/test.yml`) runs the backend `tsc` build and `pnpm test`
on every pull request update, except docs-only changes. For a branch without a PR,
start it by hand from the Actions tab.

## Backend (`apps/backend`)

- **Tests live next to the code** as `*.test.ts`. For example,
  `modules/attendance/services/compute-attendance.service.test.ts`.
- **Database**: `test/global-setup.ts` starts one in-memory MongoDB
  (`mongodb-memory-server`, no Docker needed). Each test file gets its own
  database on it. The first run downloads a MongoDB binary once.
- **Environment**: `test/setup.ts` sets `MONGO_URI`, `JWT_SECRET` and
  `NODE_ENV=test`, and blanks every webhook and API key. Tests can never call
  Discord, CRM, Cloudinary or Anthropic.
- **Helpers** (`test/helpers.ts`):
  - `clearDatabase()`
  - `createUser()` (password `TEST_PASSWORD`)
  - `createDefaultShifts()`
  - `recordWorkday()`: stores a realistic day of agent telemetry plus its
    WorkSession, built with the same generator as the dev seed.
- **HTTP**: import `app` from `src/app.ts` and use `supertest`. `app.ts` starts
  no jobs and opens no connection.
- `tsconfig.json` (the build) excludes tests. `pnpm --filter @workforce/backend
  check-types` also type-checks them through `tsconfig.test.json`.

What exists today:

- Unit tests: IST dates and shift timing, request rules, the dev-DB guard.
- Integration tests for attendance: present, late, half day, absent, leave,
  holiday.
- An HTTP smoke test: health, login, role checks.
- The seed smoke test.

## Desktop agent and dashboards

Node-environment unit tests for pure helpers only:

- Agent: `src/shared/*.test.ts`, `src/renderer/utils/*.test.ts`.
- Dashboards: `src/lib/*.test.ts`.

Keep Electron and DOM imports out of tested modules; that's why the API URL
logic lives in `src/shared/api-url.ts`. Component tests (jsdom +
Testing Library) and end-to-end tests (Playwright) aren't set up yet. Add them
to the app's `vitest.config.ts` when the first one is needed.

## What must have tests

- Every bug fix gets a test that fails without the fix.
- Any change to attendance, shifts, leave or request rules, presence detection,
  or auth and roles.
- New pure helpers (dates, parsing, formatting).
- A model change is covered by the seed smoke test once the seed is updated
  (see [seed-data.md](seed-data.md)).
