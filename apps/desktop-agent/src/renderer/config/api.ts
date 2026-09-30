import { resolveRendererApiUrl } from "../../shared/api-url";

// Single source of the backend URL for renderer code.
export const API_BASE_URL = resolveRendererApiUrl(
  import.meta.env.VITE_API_BASE_URL,
  import.meta.env.DEV,
);
