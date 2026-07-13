import axios from "axios";

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});
