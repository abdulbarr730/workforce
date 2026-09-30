import { create } from "zustand";
import type { Access } from "@/lib/access";

interface User {
  employeeId: string;
  name: string;
  email: string;
  role: string;
  department?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  // Pages / actions allowed (from sign-in and GET /api/access/me).
  access: Access | null;
  setAuth: (user: User, token: string, access?: Access | null) => void;
  setAccess: (access: Access | null) => void;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  access: null,

  setAuth: (user, token, access) => {
    localStorage.setItem("wf_token", token);
    localStorage.setItem("wf_user", JSON.stringify(user));
    if (access) localStorage.setItem("wf_access", JSON.stringify(access));
    else localStorage.removeItem("wf_access");
    set({ user, token, isAuthenticated: true, access: access || null });
  },

  setAccess: (access) => {
    if (access) localStorage.setItem("wf_access", JSON.stringify(access));
    else localStorage.removeItem("wf_access");
    set({ access });
  },

  logout: async () => {
    const token = localStorage.getItem("wf_token");
    if (token) {
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      try {
        await fetch(`${baseUrl}/api/work-sessions/quick-logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error("Failed to register logout in backend", err);
      }
    }
    localStorage.removeItem("wf_token");
    localStorage.removeItem("wf_user");
    localStorage.removeItem("wf_access");
    set({ user: null, token: null, isAuthenticated: false, access: null });
    window.location.href = "/login";
  },

  init: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("wf_token");
    const userStr = localStorage.getItem("wf_user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        let access: Access | null = null;
        try {
          access = JSON.parse(localStorage.getItem("wf_access") || "null");
        } catch {}
        set({ user, token, isAuthenticated: true, access });
      } catch {
        localStorage.removeItem("wf_token");
        localStorage.removeItem("wf_user");
      }
    }
  },
}));
