# Steps that need a human

Code and agents can't do these. Tick them off, and delete an item once it's done
for good.

## Production configuration (VPS)

- [ ] Set `CORS_ORIGINS` on the VPS to the real dashboard origins. Empty means
  every origin is allowed.
- [ ] Make sure `JWT_SECRET` on the VPS is long and random, and has never been
  shared with dev.

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

## First-time production bootstrap

Create the first Super Admin on an empty prod database:

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
