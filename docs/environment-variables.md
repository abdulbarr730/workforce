# Environment variables

Local values come from the committed examples. `pnpm setup:dev` copies them
into place. **Production values live only on the VPS** (`apps/*/.env` there)
and in GitHub environment secrets. Never commit them and never copy them into a
local file.

When you add a variable:

1. Read it through `apps/backend/src/config/env.ts` (backend). For the web
   apps, use `NEXT_PUBLIC_*` (dashboards) or `VITE_*` (agent).
2. Add it to the matching `.env.example` with a safe dev default or an empty
   value.
3. Add a row here.

## Backend (`apps/backend/.env`)

| Variable | Required | Dev default | When empty |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | Treated as non-production: CRM auth is open (see below) and logs are verbose |
| `PORT` | no | `5000` | 5000 |
| `MONGO_URI` | **yes** | `mongodb://127.0.0.1:27017/workforce_dev` | The server can't start |
| `JWT_SECRET` | **yes** | dev-only string | Login and every authenticated route fail. Prod must use its own long random value |
| `CORS_ORIGINS` | no | localhost 3000, 3001, 5173 | **All origins are allowed** |
| `CRM_API_KEY` | prod | empty | Outside production, CRM routes accept unauthenticated calls |
| `CRM_WEBHOOK_URL`, `CRM_WEBHOOK_SECRET` | no | empty | User/department changes aren't pushed to the CRM |
| `ZEPTOMAIL_TOKEN`, `MAIL_FROM_ADDRESS` | prod | empty | No emails are sent (welcome, passwords, decisions, reminders). Each attempt is still logged as `NOT_CONFIGURED` |
| `ZEPTOMAIL_API_URL` | no | `https://api.zeptomail.in/v1.1/email` | Use `https://api.zeptomail.com/v1.1/email` for a non-India ZeptoMail account |
| `MAIL_FROM_NAME` | no | `Prosync Workforce` | Sender name on emails |
| `EMPLOYEE_DASHBOARD_URL`, `ADMIN_DASHBOARD_URL` | no | `https://employee.prosyncedu.com` / empty | Links inside emails (sign-in, reset-password page) |
| `WELCOME_CALL_SHEET_WEBHOOK_URL`, `…_SECRET`, `WELCOME_CALL_SHEET_NAME` | no | empty / `Welcome calls` | Welcome calls aren't mirrored to Google Sheets |
| `CLOUDINARY_CLOUD_NAME`, `…_API_KEY`, `…_API_SECRET` | prod | empty | Screenshot upload signing and 7-day cleanup fail (logged) |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | no | empty / `claude-sonnet-4-5` | AI features (EOD suggestions, audits, Workforce Brain) fall back to local logic |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | no | empty | Admin Controls estimates AI cost with built-in prices per model family |
| `EMAIL_COST_PER_1000_USD` | no | `0.25` | Email cost estimate on Admin Controls |
| `IDENTITY_FEDERATION_ENABLED`, `…_TOKEN_FILE`, `…_TOKEN` | no | empty | Alternative Anthropic auth, off |
| `TEAMS_BREAK_WEBHOOK_URL` | no | empty | No Teams break alerts |
| `DISCORD_AUTH_WEBHOOK_URL`, `DISCORD_BREAK_WEBHOOK_URL`, `DISCORD_DAILY_FLOW_WEBHOOK_URL` | no | empty | Nothing is posted to Discord |
| `SKIP_LOGIN_ANNOUNCE` | no | empty | `1` stops Discord login announcements (scripts set it) |
| `ALLOW_REMOTE_DB` | no | empty | `true` lets `pnpm dev:api` use a non-local DB. `seed:dev` ignores it |
| `DEV_DB_GUARD` | no | set by `pnpm dev` | `1` turns on the local-DB guard in `server.ts`. Don't set it in prod |

Script-only variables:

- `seed:dev`: `SEED_PASSWORD` (default `Password@123`).
- `seed:admin`: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), `ADMIN_NAME`, `ADMIN_EMPLOYEE_ID`.

## Dashboards (`apps/admin-dashboard/.env.local`, `apps/employee-dashboard/.env.local`)

| Variable | Dev default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Backend origin **without** `/api`. It's baked in at build time |

## Desktop agent (`apps/desktop-agent/.env.development`, `.env.production`)

Both files are committed and hold no secrets.

| Variable | Dev (`.env.development`) | Release (`.env.production`) |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:5000/api` | `https://api.prosyncedu.com/api` |

The main process ignores this in packaged builds and always uses production
(`src/shared/api-url.ts`). The release CI workflows (`windows-build.yml`,
`mac-build.yml`) set it themselves.

## Tests

`apps/backend/test/setup.ts` sets its own `MONGO_URI` (in-memory), `JWT_SECRET`,
and blanks every webhook/API key. Tests never read your `.env` values for
these.
