# Developer docs

Short guides; each one should stay readable in a few minutes.

| Doc | Read it when |
| --- | --- |
| [local-development.md](local-development.md) | Setting up, or something local is broken |
| [project-map.md](project-map.md) | Looking for where something lives (agents load this automatically) |
| [architecture.md](architecture.md) | You need the big picture: data flow, jobs, models |
| [environment-variables.md](environment-variables.md) | Adding or changing configuration |
| [seed-data.md](seed-data.md) | Changing a model, or you need specific dev data |
| [testing.md](testing.md) | Writing or running tests |
| [human-actions.md](human-actions.md) | A step needs a person: secrets, releases, credential rotation || [HOSTINGER_GITHUB_DEPLOYMENT.md](HOSTINGER_GITHUB_DEPLOYMENT.md) | Production deploy pipeline (prod) |
| [vps-performance.md](vps-performance.md) | Production VPS tuning runbook (prod) |
| [workforce-brain.md](workforce-brain.md) | The AI memory layer (Workforce Brain) |
| [google-apps-script/](google-apps-script/) | The welcome-call Google Sheet sync script |

Naming convention: `dev` / `*.dev.*` means local only. Anything that affects
production is labelled **prod** explicitly.
