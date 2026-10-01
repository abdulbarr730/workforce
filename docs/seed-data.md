# Dev seed data

`pnpm seed:dev` drops the **local** database and rebuilds it. It takes about
10 s. The data is deterministic (fixed random seed) and dated relative to today
(IST): the last 14 days, including today up to the current time.

Code:

- `apps/backend/src/scripts/seed-dev.ts`: CLI, guard, drop, index build, summary.
- `apps/backend/src/scripts/seed/dev-dataset.ts`: the dataset itself.
- `apps/backend/src/scripts/seed/builders.ts`: PRNG, IST time helpers, and the
  agent-telemetry generator. The tests share these.

## What you get

| Data | Details |
| --- | --- |
| Shifts | Production defaults from `seedDefaultShifts()`: WEEKDAY, SATURDAY, SUNDAY |
| Departments | Engineering (01), Sales (02), Operations (03), each with a manager, tools and workflows |
| Users (15) | Super Admin, Admin, HR, plus a manager and 3 employees per department |
| Telemetry | About 40k agent events: login, input every ~2 min, window switches, heartbeats, lunch breaks, idle periods, logout |
| Attendance | Derived by the real `computeAttendanceFromEvents`: mostly PRESENT, plus LATE, HALF_DAY, ABSENT, LEAVE, HOLIDAY and WEEKEND |
| Analytics, devices | Derived by `generateDailyAnalytics` and `upsertDeviceFromEvent` |
| Daily flow | Todos with check-ins for each worked day. EOD reports for ~85% of past days, so "missed EOD" shows up |
| Requests | Approved leave, approved half-day, 2 pending leaves, 1 rejected leave, 1 pending attendance correction |
| Leave policy | Default leave types, saved through `saveLeavePolicy` (1.5 days/month + 4 floating days on top, rollover on). `vikram` has his own allowance with an opening balance. One blocked range. Balance snapshots derived by `allocateLeave` |
| Mark Attendance | Settings saved but **off** (attendance still comes from telemetry). One "Head Office" location. Today's marks for everyone at work, with one pending work-from-elsewhere approval |
| Email log | 3 welcome emails and 1 failed leave email (nothing is really sent locally) |
| Email senders | Accounts & passwords from `no-reply@dev.local`, HR decisions from `hr@dev.local` (replies to HR) |
| Roles | Built-ins (Admin, HR, Manager, Employee) plus `CEO` (admin portal, limited pages) and a switched-off `Operations` role. No seeded person has a custom role; give one on Roles & Logins |
| AI usage | 12 requests over the last week, for Admin Controls → AI cost |
| Own access | `kavya` (Manager) may also approve requests in the admin portal (Roles & Logins → Access for one person) |
| Other | 3 holidays, productivity rules, break schedules, 7 assigned tasks, 2 grievances, 2 device errors, admin notifications, 1 welcome-call campaign with 20 leads |

Intentionally empty collections:

- `Screenshot`: needs Cloudinary.
- `AppKnowledge` and `WorkforceBrainMemory`: the Workforce Brain job fills them.
- `FailedEvent`: only rejected telemetry lands here.
- `AttendanceShortfallAdjustment`: an admin action.

## Logins (password `Password@123` for all, or `SEED_PASSWORD`)

| Email | Role | Department |
| --- | --- | --- |
| superadmin@dev.local | SUPER_ADMIN | - |
| admin@dev.local | ADMIN | - |
| hr@dev.local | HR | - |
| arjun@dev.local, kavya@dev.local, meera@dev.local | MANAGER | Engineering, Sales, Operations |
| priya, rohan, sneha @dev.local | EMPLOYEE | Engineering |
| vikram, ananya, farhan @dev.local | EMPLOYEE | Sales |
| karan, divya, nikhil @dev.local | EMPLOYEE | Operations |

Scenarios worth knowing:

- `rohan` is on approved leave for two days.
- `ananya` has an approved half day.
- `sneha` was late on the last weekday and has a pending correction for it.
- `priya` and `farhan` have pending leave requests.

## Changing it: the checklist

When you add or change a model, field, enum or collection:

1. Register a new model in `src/scripts/_all-models.ts`.
2. Add realistic rows in `dev-dataset.ts`. Insert raw data, and let the real
   services produce derived data rather than hand-writing it.
3. If the collection should stay empty, add it to `INTENTIONALLY_EMPTY` in
   `dev-dataset.test.ts` with a reason.
4. Run `pnpm test:api`. The seed smoke test fails if any collection is
   unexpectedly empty, or if the seed crashes.
5. Run `pnpm seed:dev` and look at the affected dashboard pages.
6. Update the tables above.
