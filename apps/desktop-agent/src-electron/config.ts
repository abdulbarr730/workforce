import { app } from "electron";

import { resolveApiBaseUrl } from "../src/shared/api-url";

/**
 * Single source of the backend URL for the Electron main process.
 *
 * - Packaged (released) builds always talk to production, exactly as before.
 * - `electron-vite dev` reads VITE_API_BASE_URL from .env.development and
 *   falls back to the local backend, never to production.
 *
 * Import this module FIRST in main.ts: it also moves the dev build onto its
 * own profile before any store/queue reads app.getPath("userData").
 */
export const IS_DEV = !app.isPackaged;

export const API_BASE_URL = resolveApiBaseUrl(
  app.isPackaged,
  import.meta.env.VITE_API_BASE_URL,
);

// A dev build must not share the SQLite offline queue, auth token or
// single-instance lock with an installed production agent on the same machine,
// otherwise events could be flushed to the wrong backend.
if (IS_DEV) {
  app.setPath("userData", `${app.getPath("userData")}-dev`);
}
