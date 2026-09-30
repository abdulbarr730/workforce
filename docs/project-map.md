# Project map

Where things live. Read this before searching, and open the files it names
first. If something isn't where this map says, search, then **fix this map in
the same change** (see AGENTS.md).

## Top level

| Path | What |
| --- | --- |
| `apps/backend` | Express API + Mongoose models + background jobs (`@workforce/backend`) |
| `apps/admin-dashboard` | Next.js admin/HR app, port 3000 (`@workforce/admin-dashboard`) |
| `apps/employee-dashboard` | Next.js employee/manager app, port 3001 (`@workforce/employee-dashboard`) |
| `apps/desktop-agent` | Electron tracker (`desktop-agent`) |
| `packages/shared-types` | Event and report types. The only shared package imported by apps |
| `packages/shared-constants`, `shared-validation`, `ui`, `eslint-config`, `typescript-config` | Turborepo leftovers and configs, barely used |
| `scripts/dev/` | Local-dev helpers (`setup-env.mjs`) |
| `docker-compose.dev.yml` | Local MongoDB only |
| `ecosystem.config.cjs` | **prod** PM2 processes on the VPS |
| `.github/workflows/` | `deploy.yml` (**prod**, on push to main), `test.yml` (PRs), `windows-build.yml` / `mac-build.yml` (agent releases, manual) |
| `docs/` | Developer docs (index: `docs/README.md`) |

## Backend (`apps/backend/src`)

**Entry points**

- `server.ts`: dev-DB guard, DB connect, starts jobs, listens.
- `app.ts`: Express app, CORS, and every route mount. It has no side effects, so tests import it.
- `api/index.ts`: legacy Vercel handler, not used in prod.

**Conventions**

- **Module shape**: each module lives in `modules/<name>/` with
  `routes/<name>.routes.ts` → `controllers/*.controller.ts` → `services/*.service.ts`
  → `model/*.model.ts`, plus `validators/` (zod) and `types/`.
- **Handlers**: wrap them in `shared/utils/async-handler.ts`. Respond with
  `successResponse()` (`shared/utils/api-response.ts`). Throw
  `new AppError(msg, status)` (`shared/utils/app-error.ts`). `shared/middlwares/error.middleware.ts`
  formats errors. Note the folder is spelled `middlwares`.
- **Auth**: `shared/middlwares/auth.middleware.ts` (`authenticate`) takes a Bearer JWT,
  `?token=`, or a CRM API key. `role.middleware.ts` provides `authorize(...roles)`.
  `validate.middleware.ts` runs zod.
- **Roles**: `_shared/constants.ts` (`UserRole`). Event enums: `_shared/types.ts`.
- **Env**: read it only through `config/env.ts`. DB connection: `config/database.ts`.
  Logger: `shared/logger/logger.ts` (pino). Cloudinary: `config/cloudinary.ts`.
- **Other shared services**: `shared/services/claude.service.ts` (Anthropic),
  `notification.service.ts`. Utils: `concurrency.ts`, `micro-cache.ts`.

### Modules (`src/modules/`) and route prefixes

| Module | Prefix | Owns (models) | Notes / key files |
| --- | --- | --- | --- |
| `auth` | `/api/auth` | none | `services/login.service.ts` (bcrypt check, JWT with role and department, device upsert, Discord login post). `GET /me` |
| `users` | `/api/users` | `User` | `services/create-user.service.ts` (employeeId `EMP_<deptCode>_NN`, manual bcrypt) |
| `departments` | `/api/departments` | `Department` | `get-manager-department.service.ts` (looks up `managerId`) |
| `tracking` | `/api/tracking` | `ActivityEvent`, `FailedEvent` | **`services/ingest-events.service.ts`**, `derived-recompute.queue.ts`, `presence-proof.service.ts` |
| `attendance` | `/api/attendance` | `AttendanceRecord`, `ShiftPolicy`, `Holiday`, `LeaveRequest`, `AttendanceChangeRequest`, `AttendanceShortfallAdjustment` | **`services/compute-attendance.service.ts`**, `shift-schedule.service.ts` (IST dates, late-entry shift), `check-day-off.service.ts`, `request-rules.service.ts`, `open-attendance-sweeper.service.ts` (job), `monthly-shortfall.service.ts`, `seed-default-shifts.service.ts`. Routes: `routes/index.ts` + `/shifts` (`shift-policy.routes.ts`) + `/time-off` (`time-off.routes.ts`: leaves, holidays) + `/change-requests` |
| `work-sessions` | `/api/work-sessions` | `WorkSession` (`model/work-session.model.ts`) | Start/end/active/history. `work-session.model.ts` at the module root is an empty legacy file |
| `daily-flow` | `/api/me/*` (employee), `/api/daily-flow/*` (admin) | `DailyTodo`, `EodReport`, `BreakSchedule` | `routes/daily-flow.routes.ts` exports both routers. `services/eod-analysis-engine.service.ts` (nightly job), `eod-suggestion.service.ts` (AI). `utils/business-date.ts` |
| `me` | `/api/me` | none | The employee's own analytics |
| `analytics` | `/api/analytics` | `EmployeeDailyAnalytics` | `services/generate-daily-analytics.service.ts`, `controllers/get-live-stats.controller.ts` (cached live view), `employee-ai-audit.service.ts`, reports/exports |
| `productivity-rules` | `/api/productivity-rules` | `ProductivityRule` | `services/resolve-productivity-rule.service.ts` (cached, used by ingest) |
| `devices` | `/api/devices` | `Device`, `DeviceError` | `services/upsert-device-from-event.service.ts`, `idle-timeout.service.ts` |
| `screenshots` | `/api/screenshots` | `Screenshot` | Flat module: `screenshot.controller.ts` signs Cloudinary uploads, `screenshot.cleanup.ts` (job) |
| `notifications` | `/api/notifications` | `AdminNotification` | SSE stream (`controllers/notifications.controller.ts`), `admin-notification.service.ts`, `discord-/teams-/login-notification.service.ts` |
| `grievances` | `/api/grievances` | `Grievance` | Flat module: `grievances.routes.ts` |
| `assigned-tasks` | `/api/assigned-tasks` | `AssignedTask` | `controllers/assigned-task.controllers.ts` |
| `welcome-calls` | `/api/welcome-calls` | `WelcomeCallCampaign`, `WelcomeCallLead` | `welcome-call-allocation.service.ts`, `-scheduler.service.ts` (job), `-sheet-sync.service.ts` (Google Sheets), `-ingestion.service.ts` |
| `crm` | `/api/crm` | none | `middlewares/crm-auth.middleware.ts`, `services/crm-webhook.service.ts` |
| `workforce-brain` | `/api/workforce-brain` | `AppKnowledge`, `WorkforceBrainMemory` | `workforce-brain.service.ts`, `-scheduler.service.ts` (job), `app-activity-classifier.service.ts`. See `docs/workforce-brain.md` |

### Scripts (`src/scripts/`)

| File | Use |
| --- | --- |
| `seed-dev.ts` + `seed/dev-dataset.ts` + `seed/builders.ts` | `pnpm seed:dev` (local only) |
| `_guards.ts` | `assertLocalDatabase()`, used by the seed and the dev server |
| `_all-models.ts` | Registers every model. **Add new models here** |
| `seed-admin.ts` | **prod** first Super Admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) |
| `recompute-day.ts`, `diagnose-day.ts`, `diagnose-employee.ts`, `ensure-indexes.ts` | Ops tools that run against whatever `MONGO_URI` is set (prod on the VPS) |

### Tests

- Test files: `src/**/*.test.ts`.
- Harness: `test/global-setup.ts` (in-memory Mongo), `test/setup.ts` (env), `test/helpers.ts`.
- Config: `vitest.config.ts`. See `docs/testing.md`.

## Key flows (follow the files in order)

- **Telemetry → attendance**:
  1. Agent `tracking/event.queue.ts` → `upload.service.ts`
  2. `POST /api/tracking/ingest` → `tracking/controllers/ingest-events.controller.ts`
  3. `services/ingest-events.service.ts` (devices, rules, `ActivityEvent`, `WorkSession`)
  4. `derived-recompute.queue.ts` → `analytics/services/generate-daily-analytics.service.ts` + `attendance/services/compute-attendance.service.ts` → `AttendanceRecord`
- **Login**:
  1. Dashboard `login/page.tsx` or agent `LoginPage.tsx` → `POST /api/auth/login`
  2. `auth/services/login.service.ts` → JWT in `localStorage` (`wf_token`) or the agent's `store/auth.store.ts`
  3. Routes check it with `authenticate` + `authorize`
- **Leave / half day**:
  1. `attendance/controllers/leave.controller.ts` (`/api/attendance/time-off`)
  2. `AdminNotification` + SSE
  3. Approval → `request-rules.service.ts` `recomputeAttendanceDates()`
- **Attendance correction**:
  1. `attendance-change-request.controller.ts` (`/api/attendance/change-requests`)
  2. On approval, a snapshot is saved in `before` and the record is corrected
- **EOD**: agent `EodModal.tsx` / dashboard `EodModal.tsx` → `/api/me/eod` (`daily-flow/controllers/eod.controllers.ts`) → nightly `eod-analysis-engine.service.ts`
- **Welcome calls**: CRM/registration → `welcome-call-ingestion.service.ts` → scheduler/allocation → callers in the agent `WelcomeCallsPanel.tsx` and the employee dashboard `welcome-calls/`

## Admin dashboard (`apps/admin-dashboard/src`)

- **Shared pieces**:
  - `lib/api.ts`: axios, base `NEXT_PUBLIC_API_URL`, Bearer `wf_token`.
  - `store/auth.store.ts`: zustand.
  - `components/layout/AuthGuard.tsx`: auth redirect + SSE notifications.
  - `Sidebar.tsx`, `TopBar.tsx`, `GlobalSearch.tsx`.
  - `hooks/use-admin-notifications.ts`.
- **Pages** (`app/dashboard/<page>/page.tsx` → main API):

  | Page | Main API |
  | --- | --- |
  | overview (`page.tsx`) | users, devices, time-off |
  | `employees` | users, departments, shifts |
  | `attendance` | `/attendance/records`, `/attendance/generate` |
  | `leaves`, `holidays` | `/attendance/time-off` |
  | `requests` | time-off + `/attendance/change-requests` |
  | `shifts` (+ `history`) | `/attendance/shifts` |
  | `departments` | `/departments` |
  | `devices`, `sync-errors` | `/devices`, `/tracking/sync-errors` |
  | `daily-reports` | `/daily-flow/status`, `recent-edits` |
  | `reports` | `/analytics/*-report`, `/daily-flow/analysis` |
  | `analytics` | `/analytics/live`, `feed`, `employee-trend` |
  | `productivity-rules` | `/productivity-rules` |
  | `break-scheduler` | `/daily-flow/break-schedules` |
  | `assigned-tasks` | `/assigned-tasks` |
  | `grievances` | `/grievances/all` |
  | `welcome-calls` | `/welcome-calls/*` |
  | `workforce-brain` | `/workforce-brain/*` |
  | `screenshots/[userId]` | `/screenshots` |

## Employee dashboard (`apps/employee-dashboard/src`)

- **Shared pieces**:
  - `lib/api.ts`, `store/auth.store.ts`, `store/daily-flow.store.ts`.
  - `components/layout/AuthGuard.tsx`.
  - `components/daily-flow/*`: todo/EOD modals, missed-task alerts.
- **Pages** (`app/dashboard/`):

  | Page | Main API |
  | --- | --- |
  | overview | `/me/analytics`, `/me/todos`, `/me/eod`, `/work-sessions/active` |
  | `attendance` | records, shortfall, time-off |
  | `leaves` | `/attendance/time-off` |
  | `history`, `sessions` | `/work-sessions/*` |
  | `team-analytics` (managers) | `/analytics/*` |
  | `grievances` | `/grievances/mine` |
  | `welcome-calls` | `/welcome-calls/context` |

## Desktop agent (`apps/desktop-agent`)

**Main process (`src-electron/`)**

- `main.ts` (~1.8k lines): windows, tray, 20 IPC handlers, login/logout,
  updater, overlays.
- `config.ts`: API URL and dev profile. **Keep it the first local import in `main.ts`.**
- `preload.ts`: the `window.electronAPI` bridge. Types are in `src/renderer/types/electron.d.ts`.
- `tracking/`:
  - `activity.tracker.ts`: active window, input.
  - `idle.tracker.ts`, `session.manager.ts`, `tracking-scheduler.ts`, `screenshot.tracker.ts`.
  - `event.factory.ts`: event shape.
  - `event.queue.ts`: SQLite offline queue.
  - `upload.service.ts`: batch upload.
  - `device-info.ts`, `device-error.logger.ts`.
- `work-session/session.orchestrator.ts`, `shift-watcher.ts` (day rollover,
  remote sign-out), `health-monitor.ts`.- `store/`: `auth.store.ts` (electron-store), `queue.store.ts`, `break-usage.store.ts`.

**Renderer (`src/renderer/`)**

- `routes/AppRoutes.tsx`.
- `pages/`: `DashboardPage`, `LoginPage`, `RequestsPage`, `AssignedTasksPage`,
  `ScheduledTasksPage`, `TodoWidgetPage`, `BreakOverlayPage`, `IdleOverlayPage`.
- `components/`: `TodoModal`, `EodModal`, `CheckinModal`, `WelcomeCallsPanel`, …
- `auth/AuthContext.tsx`.
- `config/api.ts`: the API URL for the renderer.
- `utils/`: tested pure helpers.

**Shared (`src/shared/`)**

- `api-url.ts`: URL rules for main and renderer.
- `daily-flow.ts`.

**Build config**

- `electron.vite.config.ts`, `electron-builder.yml` (publish targets).
- `.env.development`, `.env.production`.

## Recipes

- **Add an endpoint**:
  1. Add a controller in `modules/<m>/controllers/`, with logic in `services/`.
  2. Add a zod validator.
  3. Register it in `routes/<m>.routes.ts` with `authenticate` + `authorize`.
  4. If it's a new module, mount it in `app.ts`.
  5. Add a supertest or service test.
  6. Add it to the table above.
- **Add a model**:
  1. Create `modules/<m>/model/<x>.model.ts`.
  2. Register it in `scripts/_all-models.ts`.
  3. Add seed rows in `seed/dev-dataset.ts`.
  4. Add factories/tests.
  5. Update `docs/architecture.md` and this map.
- **Add an env var**: `config/env.ts` → `.env.example` → `docs/environment-variables.md`.
- **Add a dashboard page**:
  1. Create `app/dashboard/<page>/page.tsx`.
  2. Add a link in `components/layout/Sidebar.tsx`.
  3. Call the API through `lib/api.ts`.
  4. Add the page to the table above.

## Gotchas

- **Dates are IST business dates** (`YYYY-MM-DD`). Use `getBusinessDate` and
  `getBusinessDayBounds` from `attendance/services/shift-schedule.service.ts`.
  Never use `new Date().toISOString().slice(0,10)` for "today".
- **User ↔ department and user ↔ shift links are strings**, not ObjectId refs
  (`departmentId`, `assignedShiftPolicyId`). `Department.managerId` holds an
  `employeeId`, though one grievance controller passes `userId`.
- **Passwords are hashed by hand** with `bcrypt` (cost 10) in services. There's no
  pre-save hook.
- **Jobs start at boot** (`server.ts`), so a dev server writes to its DB on
  its own: sweeper, welcome-call allocation, brain.
- **TTL collections**: `DeviceError` and `FailedEvent` delete themselves after 7 days.
- **Every desktop URL goes through `api-url.ts`.** Never hard-code a backend URL.
- **A push to `main` deploys prod.** Work on branches (see AGENTS.md).
