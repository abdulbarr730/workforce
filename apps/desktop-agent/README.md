# Desktop agent

The Electron app employees install. It tracks activity (input, active window,
idle, breaks, optional screenshots), queues events offline in SQLite, and
uploads them to the backend. It also shows todos, EOD, check-ins and requests.

```bash
pnpm dev:agent                                # from the repo root; calls http://localhost:5000/api
pnpm --filter desktop-agent test
pnpm --filter desktop-agent dist:win          # local installer build
```

- Dev builds read `.env.development` and use a separate `…-dev` profile.
  Packaged builds always call production (`src/shared/api-url.ts`).
- Main process: `src-electron/`. Renderer (React): `src/renderer/`. Shared pure
  code: `src/shared/`.
- Releases are built by the manual GitHub workflows `windows-build.yml` and
  `mac-build.yml`. See [docs/human-actions.md](../../docs/human-actions.md).

The full layout is in [docs/project-map.md](../../docs/project-map.md).
