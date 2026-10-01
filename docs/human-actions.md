# Steps that need a human

Code and agents can't do these. Tick them off, and delete an item once it's done
for good.

## Production configuration (VPS)

- [ ] Set `CORS_ORIGINS` on the VPS to the real dashboard origins. Empty means
  every origin is allowed.
- [ ] Make sure `JWT_SECRET` on the VPS is long and random, and has never been
  shared with dev.
- [ ] Email (Zoho ZeptoMail): create a **separate Mail Agent for Workforce**
  (the existing agent belongs to BrandForge), linked to the verified domain, not
  in sandbox mode. Copy its Send Mail token (SMTP/API tab) into
  `ZEPTOMAIL_TOKEN`, set `MAIL_FROM_ADDRESS` (the default sender, e.g.
  `no-reply@<domain>`) and optionally `MAIL_FROM_NAME`, `ZEPTOMAIL_API_URL` (`.in`
  for zoho.in accounts, `.com` otherwise) and `EMPLOYEE_DASHBOARD_URL` in the
  backend `.env` on the VPS, then restart the API. Per-type senders (e.g. `hr@`
  for decisions) are set in Admin Controls → Email log → Email senders, each
  with a "Send me a test" button.
- [ ] CRM sign-in with Workforce passwords: set `CRM_API_KEY` on the VPS and
  have the CRM call `POST /api/crm/auth/verify` (`X-API-KEY` header, body
  `{ email, password }`) at login. 200 = valid (employee in `data.employee`),
  401 = wrong, 403 `PASSWORD_CHANGE_REQUIRED` = must set a password in
  Workforce first.

Done on 2026-09-30:

- Old Atlas clusters deleted.
- Prod admin password changed.
- `NODE_ENV=production` set on the VPS.
- Deploy secret confirmed as `VPS_SSH_KEY`.

## Desktop agent releases

- [ ] `electron-builder.yml`'s macOS `publish` target is the personal
  `abdulbarr730/workforce` repo, because of Actions limits on the company
  account. Windows uses `ProSyncHub/Workforce-Agent-Releases`. This is still to
  be sorted out.
- [ ] The Windows release workflow needs the `AGENT_RELEASES_TOKEN` secret, with
  write access to the releases repo.
- [ ] Mac builds are unsigned (`identity: null`), so macOS won't auto-update
  them. Code signing isn't configured in CI.

## First-time production bootstrap (not needed — production already has data)

**Do not run this on the current production database; there is nothing to do
here.** It is only for a brand-new, empty database. Even then it only adds one
Super Admin user if that email doesn't exist yet; it never deletes or changes
data. Nothing runs it automatically (not the deploy, not PM2).

```bash
ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a-long-random-password' \
  pnpm --filter @workforce/backend seed:admin
```

## Optional integrations for local testing

Everything works locally without these. Add a **test/sandbox** key to your own
`apps/backend/.env` only when you work on the feature, and never use a
production key:

| Feature | Variables |
| --- | --- |
| Screenshots | `CLOUDINARY_*` (use a separate dev Cloudinary account) |
| AI suggestions, audits, Workforce Brain | `ANTHROPIC_API_KEY` |
| Discord/Teams alerts | a webhook for a private test channel |
