# Architecture

```
 Desktop agent (Electron)            Admin dashboard (Next, :3000)
 tracks windows, input, idle,        Employee dashboard (Next, :3001)
 breaks, screenshots                          │  REST + SSE (/api/notifications/stream)
        │ batched events (offline SQLite queue) │
        ▼                                       ▼
 ┌──────────────────── Backend API (Express, :5000) ────────────────────┐
 │ /api/tracking/ingest → ActivityEvent → derived recompute queue       │
 │        → EmployeeDailyAnalytics + AttendanceRecord                   │
 │ auth · users · departments · attendance · daily-flow · welcome-calls │
 │ background jobs (see below)                                          │
 └──────────────┬──────────────────────────────┬───────────────────────┘
                ▼                              ▼
          MongoDB (prod: VPS;           External, optional: Cloudinary,
          dev: docker-compose.dev.yml)  Anthropic, Discord, Teams, CRM, Google Sheets
```

## Core ideas

- **Telemetry is the source of truth.** The agent sends raw events: LOGIN,
  USER_ACTIVITY, ACTIVE_WINDOW, IDLE_*, BREAK_*, LOGOUT and so on. Attendance,
  work sessions, productivity and analytics are all *derived* from them and can
  be recomputed at any time (`recompute-day` script).
- **Business dates are IST** (`Asia/Kolkata`). A "day" runs from IST midnight to
  midnight, whatever the server's timezone.
- **Presence needs proof.** Only real input (USER_ACTIVITY/LOGIN), or
  window *switches* on older agents, counts as presence. Passive events
  (heartbeats, session start) never create attendance.
  See `tracking/services/presence-proof.service.ts`.
- **Shifts** (`ShiftPolicy`): WEEKDAY 10:00–18:30, SATURDAY 09:30–17:00, SUNDAY.
  A login after `loginCutoffTime` moves the whole day 30 min later and marks it
  LATE.
- **Roles**: SUPER_ADMIN, ADMIN, HR, MANAGER, EMPLOYEE. The JWT carries the role
  and `authorize(...)` enforces it per route. Admin and Super Admin don't get
  attendance.
- **Single tenant.** `companyId` is always `PROSYNC_INFOTECH_PVT_LTD`.

## Telemetry → attendance flow

1. The agent queues events locally (SQLite, `tracking/event.queue.ts`) and
   uploads batches to `POST /api/tracking/ingest`.
2. `ingest-events.service.ts` upserts devices, enriches events with
   productivity rules, stores them idempotently by `eventId`, and opens/closes
   `WorkSession`s from presence and LOGOUT events.
3. It then schedules `derived-recompute.queue.ts`. That queue is debounced per
   employee/day and runs at most 2 at a time. It runs
   `generateDailyAnalytics` and `computeAttendanceFromEvents`.
4. `compute-attendance.service.ts` picks the shift, checks holidays, leave and
   weekends (`check-day-off.service.ts`), finds the first and last real
   activity, subtracts breaks and idle time, and writes one `AttendanceRecord`
   per employee per day.

## Background jobs (started in `src/server.ts`)

| Job | Schedule | Effect |
| --- | --- | --- |
| Open-attendance sweeper | 60 s after boot, then every 10 min | Closes days left open (agent off) at the last real activity |
| Welcome-call allocation | At boot, then every 60 s | Distributes webinar registrations to callers and syncs the sheet |
| EOD analysis | Every 30 min, active 20:00–23:59 (server clock) | Nightly EOD/todo analysis |
| Workforce Brain | 60 s after boot, then every 12 h | Revises AI memory (Anthropic when configured) |
| Screenshot cleanup | Every 24 h | Deletes screenshots older than 7 days (Cloudinary + DB) |
| Leave balance snapshots | 5 min after boot, then every 6 h | Recalculates `LeaveBalanceSnapshot` for every active employee |
| Password reminders | 60 s after boot, then hourly | One email per one-time password / reset link when less than 24 h are left and it's still unused (only when ZeptoMail is set up) |

TTL indexes also auto-delete `DeviceError` and `FailedEvent` documents after
7 days.

## Data model (MongoDB, Mongoose)

| Area | Models |
| --- | --- |
| People | `User`, `Department` (links are string IDs, not refs) |
| Telemetry | `ActivityEvent`, `WorkSession`, `Device`, `DeviceError`, `FailedEvent`, `Screenshot` |
| Attendance | `AttendanceRecord`, `ShiftPolicy`, `Holiday`, `LeaveRequest`, `AttendanceChangeRequest`, `AttendanceShortfallAdjustment` |
| Leave policy | `LeavePolicy` (types, limits, rollover), `LeaveAllowance` (per-employee overrides, opening balance), `LeaveBalanceSnapshot` (derived monthly balances for payroll), `LeaveBlock` |
| Mark Attendance (off by default) | `AttendanceMarkSettings`, `WorkLocation`, `AttendanceMark` |
| Daily flow | `DailyTodo`, `EodReport`, `BreakSchedule`, `AssignedTask` |
| Analytics / AI | `EmployeeDailyAnalytics`, `ProductivityRule`, `AppKnowledge`, `WorkforceBrainMemory` |
| Other | `Grievance`, `AdminNotification`, `WelcomeCallCampaign`, `WelcomeCallLead` |

Every model is registered in `apps/backend/src/scripts/_all-models.ts`.

## Deployment (prod)

- Push to `main` → `.github/workflows/deploy.yml` → SSH to the VPS → `pnpm install`
  → build the backend and dashboards → `pm2 startOrReload ecosystem.config.cjs`.
  Details are in [HOSTINGER_GITHUB_DEPLOYMENT.md](HOSTINGER_GITHUB_DEPLOYMENT.md).
- Agent releases are started by hand (`workflow_dispatch`) in `windows-build.yml` and
  `mac-build.yml`. They publish to the GitHub releases configured in
  `apps/desktop-agent/electron-builder.yml`, and installed agents auto-update
  from there through `electron-updater`.
- Tests run on every PR through `.github/workflows/test.yml`.
