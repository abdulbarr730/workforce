// Pure URL selection shared by the Electron main process and the renderer.
// Kept free of Electron/Vite imports so it can be unit tested.
export const PRODUCTION_API_URL = "https://api.prosyncedu.com/api";
export const LOCAL_API_URL = "http://localhost:5000/api";

/** Main process: packaged builds are pinned to production. */
export const resolveApiBaseUrl = (
  isPackaged: boolean,
  devUrl: string | undefined,
): string => (isPackaged ? PRODUCTION_API_URL : devUrl || LOCAL_API_URL);

/**
 * Renderer: the URL is baked in at build time from .env.development /
 * .env.production. A missing value falls back by mode, so a dev build can
 * never silently call production.
 */
export const resolveRendererApiUrl = (
  configuredUrl: string | undefined,
  isDevBuild: boolean,
): string => configuredUrl || (isDevBuild ? LOCAL_API_URL : PRODUCTION_API_URL);
