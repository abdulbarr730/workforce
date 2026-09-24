// PM2 process definitions for the production VPS.
//
// The VPS (1–2 vCPU, 2–4 GB) also runs MongoDB, so every process gets a hard
// memory ceiling: a leak or burst restarts one process instead of letting the
// kernel OOM-kill Mongo or freeze the whole box.
const APP_DIR = process.env.APP_DIR || __dirname;

module.exports = {
  apps: [
    {
      name: "workforce-api",
      cwd: APP_DIR,
      script: "apps/backend/dist/server.js",
      node_args: "--max-old-space-size=512",
      max_memory_restart: "600M",
    },
    {
      name: "admin-dashboard",
      cwd: APP_DIR,
      script: "pnpm",
      args: "--filter @workforce/admin-dashboard start",
      interpreter: "none",
      max_memory_restart: "400M",
      env: { NODE_OPTIONS: "--max-old-space-size=320" },
    },
    {
      name: "employee-dashboard",
      cwd: APP_DIR,
      script: "pnpm",
      args: "--filter @workforce/employee-dashboard start",
      interpreter: "none",
      max_memory_restart: "400M",
      env: { NODE_OPTIONS: "--max-old-space-size=320" },
    },
  ],
};
