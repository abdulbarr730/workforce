// PM2 process definitions for the production VPS.
//
// The VPS also runs MongoDB (and other apps), so every process gets a hard
// memory ceiling: a leak or burst restarts one process instead of letting the
// kernel OOM-kill Mongo or freeze the whole box.
//
// The dashboards run the Next.js binary directly with node (not through a
// pnpm/bash wrapper) so PM2 manages — and memory-limits — the real process.
const APP_DIR = process.env.APP_DIR || __dirname;

module.exports = {
  apps: [
    {
      name: "workforce-api",
      // The API loads its .env from the working directory (apps/backend/.env).
      cwd: `${APP_DIR}/apps/backend`,
      script: "dist/server.js",
      node_args: "--max-old-space-size=512",
      max_memory_restart: "600M",
    },
    {
      name: "admin-dashboard",
      cwd: `${APP_DIR}/apps/admin-dashboard`,
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000",
      node_args: "--max-old-space-size=320",
      max_memory_restart: "400M",
    },
    {
      name: "employee-dashboard",
      cwd: `${APP_DIR}/apps/employee-dashboard`,
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3001",
      node_args: "--max-old-space-size=320",
      max_memory_restart: "400M",
    },
  ],
};
