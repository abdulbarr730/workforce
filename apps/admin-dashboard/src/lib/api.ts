import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const api = axios.create({
  baseURL: API_URL,
  // Tells the server this is the admin portal (people given admin-portal
  // access on top of an Employee role only get it here).
  headers: { "Content-Type": "application/json", "X-Portal": "admin" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("wf_token");
    // A call may pass its own token (e.g. the one-time password step).
    if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Public auth calls show their own errors (wrong password, expired link).
const PUBLIC_AUTH = /\/api\/auth\/(login|reset-password)$/;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      typeof window !== "undefined" &&
      !PUBLIC_AUTH.test(err.config?.url || "")
    ) {
      localStorage.removeItem("wf_token");
      localStorage.removeItem("wf_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
