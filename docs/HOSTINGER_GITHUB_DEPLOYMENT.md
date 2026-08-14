# Hostinger VPS deployment from GitHub

Every push to `main` runs `.github/workflows/deploy.yml`. It connects to the VPS,
pulls the exact commit, installs locked dependencies, builds the API and both web
dashboards, and then restarts their PM2 processes.

## GitHub production secrets

Open the repository, then **Settings → Environments → New environment** and create
`production`. Inside that environment, add these secrets:

| Secret                 | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| `VPS_HOST`             | VPS IP address or hostname                                       |
| `VPS_USER`             | SSH deployment user, currently `root` if no separate user exists |
| `VPS_PORT`             | SSH port, normally `22`                                          |
| `VPS_SSH_PRIVATE_KEY`  | Complete private SSH key, including BEGIN/END lines              |
| `VPS_HOST_FINGERPRINT` | VPS SSH host SHA256 fingerprint                                  |

The old `VPS_IP` and `VPS_PASSWORD` secrets remain supported temporarily, so the
workflow can run while you move to the recommended SSH-key setup. Once the key
deployment succeeds, remove `VPS_PASSWORD` from GitHub.

Add an environment variable named `VPS_APP_DIR` with the repository directory on
the VPS. The workflow defaults to `/var/www/workforce` when it is left empty.

Generate a dedicated key locally with:

```bash
ssh-keygen -t ed25519 -C "github-workforce-deploy" -f workforce_deploy_key
```

Put the contents of `workforce_deploy_key.pub` in the VPS user's
`~/.ssh/authorized_keys`. Put the complete contents of `workforce_deploy_key` in
the `VPS_SSH_PRIVATE_KEY` GitHub secret. Do not commit either key.

Obtain the host fingerprint from a trusted VPS terminal with:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}'
```

## First-run VPS requirements

The VPS must already have Git, Node.js, Corepack and PM2. The repository must be
checked out on `main`, its Git remote must be able to read the GitHub repository,
and the existing production `.env` files must remain on the VPS. The workflow does
not copy or overwrite environment files.

After setup, use **GitHub → Actions → Deploy production to Hostinger VPS** to see
each deployment or run it manually. A failed build does not restart the running
PM2 applications.
